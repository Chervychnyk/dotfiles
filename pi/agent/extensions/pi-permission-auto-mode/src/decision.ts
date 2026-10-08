import type { AuthorizerVerdict } from "@gotgenes/pi-permission-system";

import type { AutoModeConfig } from "./config.js";

export type Decision = "allow" | "deny" | "ask";

export interface BackendResult {
  decision: Decision;
  confidence: number;
}

export type DecisionReason =
  | "allow-threshold"
  | "deny-threshold"
  | "ask"
  | "low-confidence";

export interface AppliedDecision {
  verdict: AuthorizerVerdict;
  reason: DecisionReason;
}

export const DENIAL_REASON =
  "Auto-mode judged this operation unsafe to run unattended. Explain the intent or choose a safer operation.";

export function applyThresholds(
  result: BackendResult,
  config: Pick<AutoModeConfig, "allowThreshold" | "denyThreshold">,
): AppliedDecision {
  if (result.decision === "allow" && result.confidence >= config.allowThreshold) {
    return { verdict: { kind: "allow" }, reason: "allow-threshold" };
  }
  if (result.decision === "deny" && result.confidence >= config.denyThreshold) {
    return {
      verdict: { kind: "deny", reason: DENIAL_REASON },
      reason: "deny-threshold",
    };
  }
  return {
    verdict: { kind: "defer" },
    reason: result.decision === "ask" ? "ask" : "low-confidence",
  };
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function probability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function decision(value: unknown): value is Decision {
  return value === "allow" || value === "deny" || value === "ask";
}

export function parseBackendResult(value: unknown): BackendResult | undefined {
  const candidate = object(value);
  if (
    !candidate ||
    Object.keys(candidate).some((key) => key !== "decision" && key !== "confidence") ||
    !decision(candidate.decision) ||
    !probability(candidate.confidence)
  ) {
    return undefined;
  }
  return { decision: candidate.decision, confidence: candidate.confidence };
}

export function parseSystemOneResult(value: unknown): BackendResult | undefined {
  const candidate = object(value);
  if (
    !candidate ||
    candidate.type !== "choice" ||
    !decision(candidate.choice) ||
    !probability(candidate.confidence)
  ) {
    return undefined;
  }

  if (candidate.probabilities !== undefined && candidate.distribution !== undefined) {
    return undefined;
  }
  const probabilities = object(candidate.probabilities ?? candidate.distribution);
  if (!probabilities) return undefined;
  const keys = Object.keys(probabilities);
  const selectedProbability = probabilities[candidate.choice];
  if (
    keys.length !== 3 ||
    !keys.every((key) => key === "allow" || key === "deny" || key === "ask") ||
    !probability(probabilities.allow) ||
    !probability(probabilities.deny) ||
    !probability(probabilities.ask) ||
    !probability(selectedProbability)
  ) {
    return undefined;
  }
  const probabilitySum =
    probabilities.allow + probabilities.deny + probabilities.ask;
  if (Math.abs(probabilitySum - 1) > 0.001) return undefined;

  return {
    decision: candidate.choice,
    confidence: Math.min(candidate.confidence, selectedProbability),
  };
}
