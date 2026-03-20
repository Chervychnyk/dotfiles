/**
 * handoff extension — handoff-first context management.
 *
 * - Disables automatic compaction for this runtime
 * - Generates a focused handoff prompt (manual: /handoff <goal>, automatic near context limit)
 * - Stages /handoff so you can review the prompt and continue in a fresh session
 */

import { complete, type Api, type Message, type Model, type Tool, type ToolCall } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@mariozechner/pi-coding-agent";
import { BorderedLoader, convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const HANDOFF_THRESHOLD_PERCENT = 85;
const MAX_RELEVANT_FILES = 10;
const MAX_SERIALIZED_CHARS = 45_000;

interface HandoffExtraction {
  relevantInformation: string;
  relevantFiles: string[];
}

const EXTRACTION_TOOL: Tool = {
  name: "create_handoff_context",
  description:
    "Extract concise context for a follow-up coding session. Return only truly relevant details and paths.",
  parameters: Type.Object({
    relevantInformation: Type.String({
      description:
        "A concise first-person summary of critical context, decisions, constraints, and pending work for the next session.",
    }),
    relevantFiles: Type.Array(Type.String(), {
      description:
        "Workspace-relative file paths the next session should open first. Keep the list short.",
    }),
  }),
};

function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.55);
  const tail = Math.max(0, maxChars - head);
  const removed = text.length - head - tail;
  return `${text.slice(0, head)}\n\n...[truncated ${removed.toLocaleString("en-US")} chars]...\n\n${text.slice(-tail)}`;
}

function buildExtractionPrompt(conversationText: string, goal: string): string {
  return [
    "You are preparing a handoff prompt for the next coding session.",
    "Extract only information required to continue efficiently.",
    "",
    "Rules:",
    "- Be specific and technical; avoid fluff.",
    "- Include decisions already made, constraints, blockers, and exact next steps.",
    "- Keep relevantFiles to the most important files (workspace-relative).",
    "- Prefer bullet-style concise wording in relevantInformation.",
    "",
    `Goal for next session: ${goal}`,
    "",
    "Conversation:",
    conversationText,
    "",
    "Use the create_handoff_context tool now.",
  ].join("\n");
}

function sanitizePath(value: string): string {
  return value.trim().replace(/^@+/, "").replace(/^\/+/, "");
}

function extractToolCallArgs(response: { content: ({ type: string } | ToolCall)[] }): HandoffExtraction | null {
  const call = response.content.find(
    (c): c is ToolCall => c.type === "toolCall" && c.name === "create_handoff_context",
  );
  if (!call) return null;

  const args = (call.arguments ?? {}) as Record<string, unknown>;
  const relevantInformation = typeof args.relevantInformation === "string" ? args.relevantInformation.trim() : "";
  const relevantFiles = Array.isArray(args.relevantFiles)
    ? args.relevantFiles
        .map((v) => (typeof v === "string" ? sanitizePath(v) : ""))
        .filter(Boolean)
        .slice(0, MAX_RELEVANT_FILES)
    : [];

  return { relevantInformation, relevantFiles };
}

function assemblePrompt(sessionId: string, goal: string, extraction: HandoffExtraction): string {
  const parts: string[] = [];

  parts.push(`Continuing from session ${sessionId}.`);

  if (extraction.relevantFiles.length > 0) {
    parts.push(`Start with these files:\n${extraction.relevantFiles.map((f) => `@${f}`).join("\n")}`);
  }

  if (extraction.relevantInformation) {
    parts.push(`Context:\n${extraction.relevantInformation}`);
  }

  parts.push(`Goal:\n${goal}`);

  return parts.join("\n\n");
}

function fallbackPrompt(sessionId: string, goal: string, conversationText: string): string {
  return [
    `Continuing from session ${sessionId}.`,
    `Goal:\n${goal}`,
    "",
    "Context excerpt:",
    truncateMiddle(conversationText, 8_000),
  ].join("\n");
}

function getPreferredHandoffModel(ctx: {
  modelRegistry: { getAvailable(): Model<Api>[] };
  model: Model<Api> | undefined;
}): Model<Api> | undefined {
  // Prefer the currently selected model for consistency with the session.
  if (ctx.model) return ctx.model;

  // Otherwise, pick the first configured/available model.
  const available = ctx.modelRegistry.getAvailable();
  return available[0];
}

async function generateHandoffPrompt(
  ctx: ExtensionContext,
  handoffModel: Model<Api>,
  goal: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const messages = ctx.sessionManager
    .getBranch()
    .filter((e): e is SessionEntry & { type: "message" } => e.type === "message")
    .map((e) => e.message);

  if (messages.length === 0) return null;

  const sessionId = ctx.sessionManager.getSessionId();
  const conversationText = truncateMiddle(serializeConversation(convertToLlm(messages)), MAX_SERIALIZED_CHARS);

  const apiKey = await ctx.modelRegistry.getApiKey(handoffModel);
  if (!apiKey) {
    return fallbackPrompt(sessionId, goal, conversationText);
  }

  const request: Message = {
    role: "user",
    content: [{ type: "text", text: buildExtractionPrompt(conversationText, goal) }],
    timestamp: Date.now(),
  };

  try {
    const response = await complete(
      handoffModel,
      { messages: [request], tools: [EXTRACTION_TOOL] },
      { apiKey, signal, toolChoice: "any", maxTokens: 1200 },
    );

    if (response.stopReason === "aborted") return null;
    if (response.stopReason === "error") {
      return fallbackPrompt(sessionId, goal, conversationText);
    }

    const extraction = extractToolCallArgs(response as { content: ({ type: string } | ToolCall)[] });
    if (!extraction) return fallbackPrompt(sessionId, goal, conversationText);

    return assemblePrompt(sessionId, goal, extraction);
  } catch {
    return fallbackPrompt(sessionId, goal, conversationText);
  }
}

export default function handoffExtension(pi: ExtensionAPI) {
  let storedHandoffPrompt: string | null = null;
  let parentSessionFile: string | undefined;
  let handoffPending = false;
  let generating = false;

  async function executeHandoff(prompt: string, parent: string | undefined, ctx: any): Promise<boolean> {
    storedHandoffPrompt = null;
    handoffPending = false;
    generating = false;

    if (ctx.hasUI) {
      ctx.ui.setStatus("handoff", undefined);
      pi.events.emit("editor:remove-label", { key: "handoff" });
    }

    const switchResult = await ctx.newSession({ parentSession: parent });
    if (switchResult.cancelled) return false;

    pi.sendUserMessage(prompt);
    return true;
  }

  function markReady(ctx: ExtensionContext, label: string) {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus("handoff", label);
    ctx.ui.setEditorText("/handoff");
    pi.events.emit("editor:set-label", {
      key: "handoff",
      text: label,
      position: "top",
      align: "right",
    });
  }

  // Replace compaction with handoff behavior.
  pi.on("session_before_compact", async () => {
    return { cancel: true };
  });

  // Auto-generate a handoff when context gets heavy.
  pi.on("agent_end", async (_event, ctx) => {
    if (handoffPending || generating) return;

    const usage = ctx.getContextUsage();
    if (!usage || usage.percent == null) return;

    const percent = usage.percent > 1 ? usage.percent : usage.percent * 100;
    if (percent < HANDOFF_THRESHOLD_PERCENT) return;

    const handoffModel = getPreferredHandoffModel(ctx);
    if (!handoffModel) return;

    generating = true;
    parentSessionFile = ctx.sessionManager.getSessionFile();

    const goal = "continue with the highest-priority unfinished task from this session";
    const prompt = await generateHandoffPrompt(ctx, handoffModel, goal);

    generating = false;
    if (!prompt) return;

    storedHandoffPrompt = prompt;
    handoffPending = true;

    const label = `handoff ready (${Math.round(percent)}%)`;
    markReady(ctx, label);

    if (ctx.hasUI) {
      ctx.ui.notify(
        `Context is at ${Math.round(percent)}%. Handoff prompt is ready — press Enter to continue in a new session.`,
        "warning",
      );
    }
  });

  // Manual command: /handoff <goal>
  pi.registerCommand("handoff", {
    description: "Transfer context to a focused new session",
    handler: async (args, ctx) => {
      const goal = args.trim();

      if (generating) {
        if (ctx.hasUI) ctx.ui.notify("handoff generation already in progress", "info");
        return;
      }

      // Fresh generation when user passes a goal.
      if (goal) {
        const handoffModel = getPreferredHandoffModel(ctx);
        if (!handoffModel) {
          if (ctx.hasUI) ctx.ui.notify("no model available for handoff", "error");
          return;
        }

        parentSessionFile = ctx.sessionManager.getSessionFile();

        let generated: string | null = null;

        if (ctx.hasUI) {
          generated = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
            const loader = new BorderedLoader(tui, theme, `generating handoff prompt (${handoffModel.name})...`);
            loader.onAbort = () => done(null);

            generateHandoffPrompt(ctx, handoffModel, goal, loader.signal)
              .then(done)
              .catch(() => done(null));

            return loader;
          });
        } else {
          generated = await generateHandoffPrompt(ctx, handoffModel, goal);
        }

        if (!generated) {
          if (ctx.hasUI) ctx.ui.notify("handoff generation cancelled or failed", "error");
          return;
        }

        storedHandoffPrompt = generated;
        handoffPending = true;
      }

      if (!storedHandoffPrompt) {
        if (ctx.hasUI) ctx.ui.notify("no handoff prompt available. usage: /handoff <goal>", "error");
        return;
      }

      let prompt = storedHandoffPrompt;

      if (ctx.hasUI) {
        const edited = await ctx.ui.editor("handoff prompt — Enter to continue, Esc to cancel", prompt);
        if (!edited) {
          ctx.ui.notify("handoff cancelled", "info");
          return;
        }
        prompt = edited;
      }

      const parent = parentSessionFile ?? ctx.sessionManager.getSessionFile();
      const switched = await executeHandoff(prompt, parent, ctx);

      if (!switched) {
        storedHandoffPrompt = prompt;
        handoffPending = true;
        if (ctx.hasUI) ctx.ui.notify("session switch cancelled", "info");
      }
    },
  });

  // Agent-callable tool: prepares handoff and stages /handoff.
  pi.registerTool({
    name: "handoff",
    label: "Handoff",
    description:
      "Prepare a handoff to a new session. Generates a focused handoff prompt and stages /handoff for the user.",
    parameters: Type.Object({
      goal: Type.String({
        description: "What should be done in the new session. Keep it specific.",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const goal = params.goal.trim();
      if (!goal) {
        return {
          content: [{ type: "text", text: "goal is required" }],
          isError: true,
        } as any;
      }

      const handoffModel = getPreferredHandoffModel(ctx);
      if (!handoffModel) {
        return {
          content: [{ type: "text", text: "no model available for handoff" }],
          isError: true,
        } as any;
      }

      parentSessionFile = ctx.sessionManager.getSessionFile();
      const prompt = await generateHandoffPrompt(ctx, handoffModel, goal, signal ?? undefined);

      if (!prompt) {
        return {
          content: [{ type: "text", text: "handoff generation failed" }],
          isError: true,
        } as any;
      }

      storedHandoffPrompt = prompt;
      handoffPending = true;

      if (ctx.hasUI) {
        markReady(ctx, "handoff ready");
      }

      return {
        content: [
          {
            type: "text",
            text: `handoff prompt generated for: "${goal}". run /handoff to review and continue in a new session.`,
          },
        ],
      } as any;
    },
  });

  pi.on("session_switch", async (_event, ctx) => {
    storedHandoffPrompt = null;
    handoffPending = false;
    generating = false;

    if (ctx.hasUI) {
      ctx.ui.setStatus("handoff", undefined);
      pi.events.emit("editor:remove-label", { key: "handoff" });
    }
  });
}
