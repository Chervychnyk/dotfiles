import type { PromptPermissionDetails } from "@gotgenes/pi-permission-system";

export function details(
  overrides: {
    kind?: PromptPermissionDetails["payload"]["kind"];
    surface?: string;
    evidence?: PromptPermissionDetails["payload"]["evidence"];
    value?: string;
    commandContext?: PromptPermissionDetails["payload"]["request"]["commandContext"];
    executedUnit?: string | null;
  } = {},
): PromptPermissionDetails {
  return {
    requestId: "request-1",
    source: "tool_call",
    agentName: "worker",
    payload: {
      kind: overrides.kind ?? "bash",
      request: {
        requester: { agentName: "worker", forwarded: false, sessionId: null },
        surface: overrides.surface ?? "bash",
        toolName: "bash",
        invokedToolName: null,
        value: overrides.value ?? "npm test",
        matchedPattern: "*",
        commandContext: overrides.commandContext ?? null,
        executedUnit: overrides.executedUnit ?? null,
      },
      evidence: overrides.evidence ?? [],
      annotations: [{ source: "ignored", text: "do not send me" }],
    },
    toolInputPreview: "must not be sent",
  };
}
