import { describe, expect, it } from "vitest";

import { parseConfig } from "../src/config.js";

const base = {
  enabled: false,
  backend: {
    type: "jev" as const,
    endpoint: "http://127.0.0.1:11434/v1/systemone",
    model: "tev",
  },
  timeoutMs: 5000,
  maxCommandBytes: 8192,
  allowThreshold: 0.9,
  denyThreshold: 0.98,
};

describe("parseConfig", () => {
  it("accepts the complete checked-in shape", () => {
    const config = parseConfig(base);
    expect(config.enabled).toBe(false);
    expect(config.allowThreshold).toBe(0.9);
    expect(config.denyThreshold).toBe(0.98);
    expect(config.maxCommandBytes).toBe(8192);
    expect(config.backend).toEqual({
      type: "jev",
      endpoint: "http://127.0.0.1:11434/v1/systemone",
      model: "tev",
    });
  });

  it("accepts a Pi registry LLM", () => {
    expect(
      parseConfig({
        ...base,
        enabled: true,
        backend: { type: "llm", provider: "openai", model: "gpt-5.4-mini" },
      }).backend,
    ).toEqual({ type: "llm", provider: "openai", model: "gpt-5.4-mini" });
  });

  it.each([
    [{}, "enabled"],
    [{ ...base, enabled: "yes" }, "enabled"],
    [{ enabled: false }, "backend"],
    [{ enabled: false, backend: base.backend }, "timeoutMs"],
    [{ ...base, backend: { type: "unknown" } }, "backend.type"],
    [{ ...base, unknown: true }, "unknown key"],
    [{ ...base, backend: { ...base.backend, unknown: true } }, "unknown key"],
    [{ ...base, timeoutMs: 1 }, "timeoutMs"],
    [{ ...base, maxCommandBytes: -1 }, "maxCommandBytes"],
    [{ ...base, allowThreshold: 1.1 }, "allowThreshold"],
    [{ ...base, allowThreshold: 0.9, denyThreshold: 0.8 }, "denyThreshold"],
  ])("rejects malformed configuration %#", (raw, message) => {
    expect(() => parseConfig(raw)).toThrow(message);
  });
});
