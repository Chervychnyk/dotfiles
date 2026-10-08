import type { AuthorizerLog } from "@gotgenes/pi-permission-system";
import { describe, expect, it, vi } from "vitest";

import { parseConfig } from "../src/config.js";
import { createReviewer } from "../src/reviewer.js";
import { details } from "./helpers.js";

const config = parseConfig({
  enabled: true,
  backend: {
    type: "jev",
    endpoint: "http://127.0.0.1:11434/v1/systemone",
    model: "tev",
  },
  timeoutMs: 5000,
  maxCommandBytes: 8192,
  allowThreshold: 0.9,
  denyThreshold: 0.98,
});

function logger() {
  return { review: vi.fn(), debug: vi.fn() } satisfies AuthorizerLog;
}

describe("auto-mode reviewer", () => {
  it("defers without calling the backend while disabled", async () => {
    const decide = vi.fn();
    const authorize = createReviewer({ getConfig: () => config, isEnabled: () => false, decide });
    await expect(authorize(details(), {} as never, logger())).resolves.toEqual({ kind: "defer" });
    expect(decide).not.toHaveBeenCalled();
  });

  it("always defers protected paths", async () => {
    const decide = vi.fn();
    const log = logger();
    const authorize = createReviewer({ getConfig: () => config, isEnabled: () => true, decide });
    await expect(authorize(details({ kind: "path", surface: "path", value: "/tmp/a" }), {} as never, log)).resolves.toEqual({ kind: "defer" });
    expect(decide).not.toHaveBeenCalled();
    expect(log.review).toHaveBeenCalledWith("auto_mode.review", {
      requestId: "request-1",
      outcome: "defer",
      reason: "protected-surface",
    });
  });

  it("does not send an oversized request value to the backend", async () => {
    const decide = vi.fn();
    const authorize = createReviewer({ getConfig: () => config, isEnabled: () => true, decide });
    await expect(
      authorize(details({ value: "x".repeat(config.maxCommandBytes + 1) }), {} as never, logger()),
    ).resolves.toEqual({ kind: "defer" });
    expect(decide).not.toHaveBeenCalled();
  });

  it("defers on every backend failure and logs no raw facts or error", async () => {
    const log = logger();
    const authorize = createReviewer({
      getConfig: () => config,
      isEnabled: () => true,
      decide: async () => { throw new Error("secret backend response"); },
      now: (() => { let time = 10; return () => time += 5; })(),
    });
    await expect(authorize(details({ value: "echo TOP_SECRET" }), {} as never, log)).resolves.toEqual({ kind: "defer" });
    const serialized = JSON.stringify(log.review.mock.calls);
    expect(serialized).not.toContain("TOP_SECRET");
    expect(serialized).not.toContain("secret backend response");
    expect(serialized).toContain("backend-failure");
  });

  it("logs only sanitized decision metadata", async () => {
    const log = logger();
    const authorize = createReviewer({
      getConfig: () => config,
      isEnabled: () => true,
      decide: async () => ({ decision: "allow", confidence: 0.95 }),
      now: (() => { let time = 0; return () => time += 3; })(),
    });
    await expect(authorize(details(), {} as never, log)).resolves.toEqual({ kind: "allow" });
    expect(log.review).toHaveBeenCalledWith("auto_mode.review", {
      requestId: "request-1",
      backend: "jev",
      outcome: "allow",
      reason: "allow-threshold",
      confidence: 0.95,
      latencyMs: 3,
    });
  });
});
