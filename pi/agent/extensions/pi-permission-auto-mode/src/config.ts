import { readFileSync } from "node:fs";

export type BackendConfig =
  | { type: "jev"; endpoint: string; model: string }
  | { type: "llm"; provider: string; model: string };

export interface AutoModeConfig {
  enabled: boolean;
  backend: BackendConfig;
  timeoutMs: number;
  maxCommandBytes: number;
  allowThreshold: number;
  denyThreshold: number;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("configuration must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  name: string,
): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${name} contains unknown key ${unknown}`);
}

function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
}

function nonEmpty(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

export function parseConfig(raw: unknown): AutoModeConfig {
  const value = record(raw);
  rejectUnknownKeys(
    value,
    [
      "$schema",
      "enabled",
      "backend",
      "timeoutMs",
      "maxCommandBytes",
      "allowThreshold",
      "denyThreshold",
    ],
    "configuration",
  );
  if (value.$schema !== undefined && typeof value.$schema !== "string") {
    throw new Error("$schema must be a string");
  }
  if (typeof value.enabled !== "boolean") {
    throw new Error("enabled must be a boolean");
  }
  if (value.backend === undefined) {
    throw new Error("backend is required");
  }

  const candidate = record(value.backend);
  let backend: BackendConfig;
  if (candidate.type === "jev") {
    rejectUnknownKeys(candidate, ["type", "endpoint", "model"], "backend");
    const endpoint = nonEmpty(candidate.endpoint, "backend.endpoint");
    try {
      new URL(endpoint);
    } catch {
      throw new Error("backend.endpoint must be an absolute URL");
    }
    backend = { type: "jev", endpoint, model: nonEmpty(candidate.model, "backend.model") };
  } else if (candidate.type === "llm") {
    rejectUnknownKeys(candidate, ["type", "provider", "model"], "backend");
    backend = {
      type: "llm",
      provider: nonEmpty(candidate.provider, "backend.provider"),
      model: nonEmpty(candidate.model, "backend.model"),
    };
  } else {
    throw new Error('backend.type must be "jev" or "llm"');
  }

  const timeoutMs = finiteNumber(value.timeoutMs, "timeoutMs");
  const maxCommandBytes = finiteNumber(value.maxCommandBytes, "maxCommandBytes");
  const allowThreshold = finiteNumber(value.allowThreshold, "allowThreshold");
  const denyThreshold = finiteNumber(value.denyThreshold, "denyThreshold");

  if (!Number.isInteger(timeoutMs) || timeoutMs < 100) {
    throw new Error("timeoutMs must be an integer of at least 100");
  }
  if (!Number.isInteger(maxCommandBytes) || maxCommandBytes < 0) {
    throw new Error("maxCommandBytes must be a non-negative integer");
  }
  if (allowThreshold < 0 || allowThreshold > 1) {
    throw new Error("allowThreshold must be between 0 and 1");
  }
  if (denyThreshold < 0 || denyThreshold > 1) {
    throw new Error("denyThreshold must be between 0 and 1");
  }
  if (denyThreshold <= allowThreshold) {
    throw new Error("denyThreshold must be greater than allowThreshold");
  }

  return {
    enabled: value.enabled,
    backend,
    timeoutMs,
    maxCommandBytes,
    allowThreshold,
    denyThreshold,
  };
}

export function loadConfig(path: URL): AutoModeConfig {
  return parseConfig(JSON.parse(readFileSync(path, "utf8")));
}
