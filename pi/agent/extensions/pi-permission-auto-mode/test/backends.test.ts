import type { AssistantMessage } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";

import { decideWithJev, decideWithLlm, parseLlmReply } from "../src/backends.js";
import { normalizedFacts } from "../src/facts.js";
import { details } from "./helpers.js";

const facts = normalizedFacts(details(), 8_192);

function assistant(content: AssistantMessage["content"], stopReason: AssistantMessage["stopReason"] = "toolUse"): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "openai-responses",
    provider: "openai",
    model: "gpt-5.4-mini",
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason,
    timestamp: Date.now(),
  };
}

describe("JEV backend", () => {
  it("posts System One state to the configured endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      answers: {
        permission: {
          type: "choice",
          choice: "allow",
          confidence: 0.93,
          probabilities: { allow: 0.95, deny: 0.01, ask: 0.04 },
        },
      },
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(decideWithJev(
      { type: "jev", endpoint: "http://localhost:11434/v1/systemone", model: "tev" },
      { facts, timeoutMs: 500 },
      fetchMock,
    )).resolves.toEqual({ decision: "allow", confidence: 0.93 });

    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://localhost:11434/v1/systemone");
    const body = JSON.parse(String(init.body));
    expect(body.state).toEqual(facts);
    expect(body.questions.permission.criteria).toHaveProperty("ask");
  });

  it("rejects HTTP and malformed results", async () => {
    await expect(decideWithJev(
      { type: "jev", endpoint: "http://localhost:11434/v1/systemone", model: "tev" },
      { facts, timeoutMs: 500 },
      async () => new Response("bad", { status: 500 }),
    )).rejects.toThrow("HTTP 500");
    await expect(decideWithJev(
      { type: "jev", endpoint: "http://localhost:11434/v1/systemone", model: "tev" },
      { facts, timeoutMs: 500 },
      async () => new Response(JSON.stringify({ answers: {} }), { status: 200 }),
    )).rejects.toThrow("malformed");
  });
});

describe("Pi model-registry LLM backend", () => {
  it("uses the configured registry model and a structured tool result", async () => {
    const model = { provider: "openai", id: "gpt-5.4-mini" } as never;
    let sentContext: { messages: unknown[]; tools: Array<{ constrainedSampling?: unknown }> } | undefined;
    const streamSimple = vi.fn((_model: unknown, context: typeof sentContext) => {
      sentContext = context;
      return {
        result: async () => assistant([{ type: "toolCall", id: "1", name: "report_permission_decision", arguments: { decision: "deny", confidence: 0.99 } }]),
      };
    });
    const registry = { find: vi.fn(() => model), streamSimple } as never;

    await expect(decideWithLlm(
      { type: "llm", provider: "openai", model: "gpt-5.4-mini" },
      { facts, timeoutMs: 500 },
      registry,
    )).resolves.toEqual({ decision: "deny", confidence: 0.99 });
    expect(streamSimple).toHaveBeenCalledOnce();
    expect(sentContext?.messages).toHaveLength(1);
    expect(sentContext?.tools[0]?.constrainedSampling).toEqual({ type: "json_schema", strict: "require" });
  });

  it("rejects missing models and malformed replies", async () => {
    await expect(decideWithLlm(
      { type: "llm", provider: "openai", model: "missing" },
      { facts, timeoutMs: 500 },
      { find: () => undefined } as never,
    )).rejects.toThrow("model registry");
    expect(() => parseLlmReply(assistant([{ type: "text", text: "allow" }], "stop"))).toThrow("tool use");
  });

  it.each([
    assistant([
      { type: "text", text: "Here is my verdict" },
      { type: "toolCall", id: "1", name: "report_permission_decision", arguments: { decision: "allow", confidence: 1 } },
    ]),
    assistant([
      { type: "toolCall", id: "1", name: "report_permission_decision", arguments: { decision: "allow", confidence: 1 } },
      { type: "toolCall", id: "2", name: "report_permission_decision", arguments: { decision: "deny", confidence: 1 } },
    ]),
    assistant([
      { type: "toolCall", id: "1", name: "unrelated", arguments: {} },
      { type: "toolCall", id: "2", name: "report_permission_decision", arguments: { decision: "allow", confidence: 1 } },
    ]),
    assistant([
      { type: "toolCall", id: "1", name: "report_permission_decision", arguments: { decision: "allow", confidence: 1 } },
    ], "stop"),
  ])("rejects mixed, multiple, unrelated, or unsuccessfully stopped replies %#", (reply) => {
    expect(() => parseLlmReply(reply)).toThrow();
  });
});
