import type { PromptPermissionDetails } from "@gotgenes/pi-permission-system";

const FULL_COMMAND_LABEL = "full command";

export interface PermissionFacts {
  kind: string;
  surface: string;
  toolName: string | null;
  invokedToolName: string | null;
  value: string;
  matchedPattern: string | null;
  commandContext: string | null;
  executedUnit: string | null;
  requester: {
    agentName: string | null;
    forwarded: boolean;
  };
  fullCommand?: string;
}

export function mustDeferSurface(details: PromptPermissionDetails): boolean {
  const { kind, request } = details.payload;
  return (
    request.surface.startsWith("path") ||
    request.surface.startsWith("external_directory") ||
    kind === "path" ||
    kind === "external_directory" ||
    kind === "bash_external_directory"
  );
}

export function normalizedFacts(
  details: PromptPermissionDetails,
  maxCommandBytes: number,
): PermissionFacts {
  const { payload } = details;
  const request = payload.request;
  for (const value of [request.value, request.commandContext, request.executedUnit]) {
    if (value !== null && Buffer.byteLength(value, "utf8") > maxCommandBytes) {
      throw new Error("command-bearing permission fact exceeds maxCommandBytes");
    }
  }

  const facts: PermissionFacts = {
    kind: payload.kind,
    surface: request.surface,
    toolName: request.toolName,
    invokedToolName: request.invokedToolName,
    value: request.value,
    matchedPattern: request.matchedPattern,
    commandContext: request.commandContext,
    executedUnit: request.executedUnit,
    requester: {
      agentName: request.requester.agentName,
      forwarded: request.requester.forwarded,
    },
  };

  if (payload.kind !== "bash") return facts;
  const fullCommand = payload.evidence.find(
    (entry) => entry.label === FULL_COMMAND_LABEL && entry.text.length > 0,
  )?.text;
  if (
    fullCommand !== undefined &&
    Buffer.byteLength(fullCommand, "utf8") <= maxCommandBytes
  ) {
    facts.fullCommand = fullCommand;
  }
  return facts;
}
