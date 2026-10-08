import type {
  Authorizer,
  AuthorizerLog,
  AuthorizerVerdict,
} from "@gotgenes/pi-permission-system";

import type { BackendResult } from "./decision.js";
import { applyThresholds } from "./decision.js";
import type { AutoModeConfig } from "./config.js";
import { mustDeferSurface, normalizedFacts } from "./facts.js";

export interface ReviewerDependencies {
  getConfig: () => AutoModeConfig;
  isEnabled: () => boolean;
  decide: (config: AutoModeConfig, facts: ReturnType<typeof normalizedFacts>) => Promise<BackendResult>;
  now?: () => number;
}

function review(
  log: AuthorizerLog,
  details: Parameters<Authorizer["authorize"]>[0],
  fields: Record<string, unknown>,
): void {
  log.review("auto_mode.review", {
    requestId: details.requestId,
    ...fields,
  });
}

export function createReviewer(dependencies: ReviewerDependencies): Authorizer["authorize"] {
  const now = dependencies.now ?? Date.now;
  return async (details, _query, log): Promise<AuthorizerVerdict> => {
    if (!dependencies.isEnabled()) return { kind: "defer" };

    const config = dependencies.getConfig();
    if (mustDeferSurface(details)) {
      review(log, details, { outcome: "defer", reason: "protected-surface" });
      return { kind: "defer" };
    }

    const startedAt = now();
    try {
      const result = await dependencies.decide(
        config,
        normalizedFacts(details, config.maxCommandBytes),
      );
      const applied = applyThresholds(result, config);
      review(log, details, {
        backend: config.backend.type,
        outcome: applied.verdict.kind,
        reason: applied.reason,
        confidence: result.confidence,
        latencyMs: Math.max(0, now() - startedAt),
      });
      return applied.verdict;
    } catch {
      review(log, details, {
        backend: config.backend.type,
        outcome: "defer",
        reason: "backend-failure",
        latencyMs: Math.max(0, now() - startedAt),
      });
      return { kind: "defer" };
    }
  };
}
