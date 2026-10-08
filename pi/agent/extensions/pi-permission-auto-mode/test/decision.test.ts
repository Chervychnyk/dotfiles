import { describe, expect, it } from "vitest";

import {
  applyThresholds,
  parseBackendResult,
  parseSystemOneResult,
} from "../src/decision.js";

const thresholds = { allowThreshold: 0.9, denyThreshold: 0.98 };

describe("applyThresholds", () => {
  it("allows at the allow threshold", () => {
    expect(applyThresholds({ decision: "allow", confidence: 0.9 }, thresholds).verdict).toEqual({ kind: "allow" });
  });

  it("uses the stricter deny threshold", () => {
    expect(applyThresholds({ decision: "deny", confidence: 0.97 }, thresholds).verdict).toEqual({ kind: "defer" });
    expect(applyThresholds({ decision: "deny", confidence: 0.98 }, thresholds).verdict.kind).toBe("deny");
  });

  it("always defers an ask decision", () => {
    expect(applyThresholds({ decision: "ask", confidence: 1 }, thresholds).verdict).toEqual({ kind: "defer" });
  });
});

describe("parseBackendResult", () => {
  it.each([
    null,
    {},
    { decision: "maybe", confidence: 1 },
    { decision: "allow" },
    { decision: "allow", confidence: 2 },
  ])("rejects malformed output %#", (value) => {
    expect(parseBackendResult(value)).toBeUndefined();
  });
});

describe("parseSystemOneResult", () => {
  it.each(["probabilities", "distribution"] as const)(
    "uses the lower of reported confidence and selected probability from %s",
    (field) => {
      expect(
        parseSystemOneResult({
          type: "choice",
          choice: "allow",
          confidence: 0.5,
          [field]: { allow: 0.94, deny: 0.01, ask: 0.05 },
        }),
      ).toEqual({ decision: "allow", confidence: 0.5 });
    },
  );

  it.each([
    { choice: "allow", confidence: 1, probabilities: { allow: 1, deny: 0, ask: 0 } },
    { type: "text", choice: "allow", confidence: 1, probabilities: { allow: 1, deny: 0, ask: 0 } },
    { type: "choice", choice: "maybe", confidence: 1, probabilities: { allow: 1, deny: 0, ask: 0 } },
    { type: "choice", choice: "allow", confidence: Number.NaN, probabilities: { allow: 1, deny: 0, ask: 0 } },
    { type: "choice", choice: "allow", confidence: 1, probabilities: { allow: 1, deny: 0 } },
    { type: "choice", choice: "allow", confidence: 1, probabilities: { allow: 1, deny: 0, ask: 0, other: 0 } },
    { type: "choice", choice: "allow", confidence: 1, probabilities: { allow: 2, deny: 0, ask: 0 } },
    { type: "choice", choice: "allow", confidence: 1, probabilities: { allow: 1, deny: 1, ask: 1 } },
    {
      type: "choice",
      choice: "allow",
      confidence: 1,
      probabilities: { allow: 1, deny: 0, ask: 0 },
      distribution: { allow: 1, deny: 0, ask: 0 },
    },
  ])("rejects malformed choice answers %#", (value) => {
    expect(parseSystemOneResult(value)).toBeUndefined();
  });
});
