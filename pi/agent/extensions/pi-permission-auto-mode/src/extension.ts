import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  getPermissionsService,
  PERMISSIONS_READY_CHANNEL,
  type PermissionsReadyEvent,
} from "@gotgenes/pi-permission-system";

import { decideWithJev, decideWithLlm } from "./backends.js";
import { loadConfig, type AutoModeConfig } from "./config.js";
import { createReviewer } from "./reviewer.js";

export const LINK_NAME = "auto-mode";
export const STATUS_KEY = "auto-mode";

export interface ExtensionDependencies {
  configUrl: URL;
  jev?: typeof decideWithJev;
  llm?: typeof decideWithLlm;
  load?: typeof loadConfig;
}

function backendLabel(config: AutoModeConfig): string {
  return config.backend.type === "jev"
    ? `jev/${config.backend.model}`
    : `${config.backend.provider}/${config.backend.model}`;
}

export function createAutoModeExtension(
  pi: ExtensionAPI,
  dependencies: ExtensionDependencies,
): void {
  const jev = dependencies.jev ?? decideWithJev;
  const llm = dependencies.llm ?? decideWithLlm;
  const load = dependencies.load ?? loadConfig;
  let config: AutoModeConfig | undefined;
  let enabled = false;
  let configError = false;
  let context: ExtensionContext | undefined;
  let dispose: (() => void) | undefined;
  let registeredSessionId: string | undefined;

  function statusText(): string {
    if (configError) return "auto-mode: error (invalid config)";
    return enabled && config
      ? `auto-mode: on (${backendLabel(config)})`
      : "auto-mode: off";
  }

  function refreshStatus(): void {
    context?.ui.setStatus(STATUS_KEY, statusText());
  }

  const authorize = createReviewer({
    getConfig: () => {
      if (!config) throw new Error("auto-mode configuration is unavailable");
      return config;
    },
    isEnabled: () => enabled,
    decide: async (current, facts) => {
      if (current.backend.type === "jev") {
        return jev(current.backend, { facts, timeoutMs: current.timeoutMs });
      }
      if (!context) throw new Error("session is unavailable");
      return llm(
        current.backend,
        { facts, timeoutMs: current.timeoutMs },
        context.modelRegistry,
      );
    },
  });

  pi.registerCommand("auto-mode", {
    description: "Show, enable, or disable automatic permission decisions",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase() || "status";
      if (action === "on") {
        if (!config) {
          ctx.ui.notify("Auto-mode configuration is invalid or unavailable", "warning");
          return;
        }
        enabled = true;
      } else if (action === "off") enabled = false;
      else if (action !== "status") {
        ctx.ui.notify("Usage: /auto-mode [status|on|off]", "warning");
        return;
      }
      refreshStatus();
      ctx.ui.notify(statusText(), enabled ? "info" : "warning");
    },
  });

  pi.on("session_start", (_event, ctx) => {
    context = ctx;
    enabled = false;
    config = undefined;
    configError = false;
    try {
      config = load(dependencies.configUrl);
      enabled = config.enabled;
    } catch {
      configError = true;
    }
    refreshStatus();
  });

  pi.events.on(PERMISSIONS_READY_CHANNEL, (raw) => {
    const sessionId = (raw as PermissionsReadyEvent | undefined)?.sessionId;
    if (typeof sessionId !== "string" || sessionId === registeredSessionId) return;
    const service = getPermissionsService(sessionId);
    if (!service) return;
    dispose?.();
    dispose = service.registerAuthorizer(LINK_NAME, authorize);
    registeredSessionId = sessionId;
  });

  pi.on("session_shutdown", () => {
    dispose?.();
    dispose = undefined;
    registeredSessionId = undefined;
    enabled = false;
    config = undefined;
    configError = false;
    context?.ui.setStatus(STATUS_KEY, undefined);
    context = undefined;
  });
}
