import { describe, expect, it } from "vitest";

import { mustDeferSurface, normalizedFacts } from "../src/facts.js";
import { details } from "./helpers.js";

describe("normalizedFacts", () => {
  it("uses only normalized request facts and ignores previews and annotations", () => {
    const facts = normalizedFacts(details(), 8_192);
    const serialized = JSON.stringify(facts);
    expect(facts.value).toBe("npm test");
    expect(serialized).not.toContain("must not be sent");
    expect(serialized).not.toContain("do not send me");
    expect(serialized).not.toContain("sessionId");
  });

  it("includes exact full-command evidence within the byte budget", () => {
    const command = "printf 'é' | wc -c";
    const facts = normalizedFacts(
      details({ evidence: [{ label: "full command", text: command, detail: null }] }),
      Buffer.byteLength(command),
    );
    expect(facts.fullCommand).toBe(command);
  });

  it.each([
    { value: "é" },
    { commandContext: "command_substitution" as const },
    { executedUnit: "é" },
  ])("rejects an oversized command-bearing request fact %#", (overrides) => {
    expect(() => normalizedFacts(details(overrides), 1)).toThrow("maxCommandBytes");
  });

  it("omits oversized and unrelated evidence", () => {
    expect(
      normalizedFacts(
        details({ value: "x", evidence: [{ label: "full command", text: "é", detail: null }] }),
        1,
      ).fullCommand,
    ).toBeUndefined();
    expect(
      normalizedFacts(
        details({ value: "x", evidence: [{ label: "file contents", text: "secret", detail: null }] }),
        8_192,
      ).fullCommand,
    ).toBeUndefined();
  });
});

describe("mustDeferSurface", () => {
  it.each([
    details({ kind: "path", surface: "path" }),
    details({ kind: "external_directory", surface: "external_directory" }),
    details({ kind: "bash_external_directory", surface: "external_directory" }),
    details({ kind: "tool", surface: "path:canonical" }),
  ])("protects path surfaces", (request) => {
    expect(mustDeferSurface(request)).toBe(true);
  });

  it("allows non-path asks to reach a backend", () => {
    expect(mustDeferSurface(details())).toBe(false);
  });
});
