import type { Authorizer } from "@gotgenes/pi-permission-system";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAutoModeExtension, LINK_NAME, STATUS_KEY } from "../src/extension.js";
import { details } from "./helpers.js";

const SERVICE_KEY = Symbol.for("@gotgenes/pi-permission-system:session-services");

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[SERVICE_KEY];
});

describe("extension wiring", () => {
  it("registers auto-mode, defaults off, toggles per session, and clears the footer", async () => {
    const lifecycle = new Map<string, (event: unknown, ctx: any) => unknown>();
    const bus = new Map<string, (event: unknown) => unknown>();
    let command: ((args: string, ctx: any) => Promise<void>) | undefined;
    let authorize: Authorizer["authorize"] | undefined;
    const setStatus = vi.fn();
    const notify = vi.fn();
    const dispose = vi.fn();
    const service = {
      registerAuthorizer: vi.fn((name: string, callback: Authorizer["authorize"]) => {
        expect(name).toBe(LINK_NAME);
        authorize = callback;
        return dispose;
      }),
    };
    (globalThis as Record<symbol, unknown>)[SERVICE_KEY] = new Map([["session-1", service]]);

    const pi = {
      registerCommand: (_name: string, definition: { handler: typeof command }) => {
        command = definition.handler;
      },
      on: (name: string, handler: (event: unknown, ctx: any) => unknown) => {
        lifecycle.set(name, handler);
      },
      events: {
        on: (name: string, handler: (event: unknown) => unknown) => {
          bus.set(name, handler);
        },
      },
    };
    createAutoModeExtension(pi as never, {
      configUrl: new URL("../config.json", import.meta.url),
      jev: async () => ({ decision: "allow", confidence: 0.99 }),
    });

    const context = { ui: { setStatus, notify }, modelRegistry: {} };
    lifecycle.get("session_start")?.({}, context);
    expect(setStatus).toHaveBeenLastCalledWith(STATUS_KEY, "auto-mode: off");

    bus.get("permissions:ready")?.({ sessionId: "session-1", adjudicatesLocally: true });
    bus.get("permissions:ready")?.({ sessionId: "session-1", adjudicatesLocally: true });
    expect(service.registerAuthorizer).toHaveBeenCalledOnce();
    expect(await authorize?.(details(), {} as never, { review: vi.fn(), debug: vi.fn() })).toEqual({ kind: "defer" });

    await command?.("on", context);
    expect(setStatus).toHaveBeenLastCalledWith(STATUS_KEY, "auto-mode: on (jev/tev1)");
    expect(await authorize?.(details(), {} as never, { review: vi.fn(), debug: vi.fn() })).toEqual({ kind: "allow" });

    await command?.("bogus", context);
    expect(notify).toHaveBeenLastCalledWith("Usage: /auto-mode [status|on|off]", "warning");

    lifecycle.get("session_shutdown")?.({}, context);
    expect(dispose).toHaveBeenCalledOnce();
    expect(setStatus).toHaveBeenLastCalledWith(STATUS_KEY, undefined);
  });

  it("resets enabled and backend state when replacement-session config is invalid", async () => {
    const lifecycle = new Map<string, (event: unknown, ctx: any) => unknown>();
    const bus = new Map<string, (event: unknown) => unknown>();
    let command: ((args: string, ctx: any) => Promise<void>) | undefined;
    let firstAuthorize: Authorizer["authorize"] | undefined;
    let secondAuthorize: Authorizer["authorize"] | undefined;
    const firstDispose = vi.fn();
    const firstService = {
      registerAuthorizer: vi.fn((_name: string, callback: Authorizer["authorize"]) => {
        firstAuthorize = callback;
        return firstDispose;
      }),
    };
    const secondService = {
      registerAuthorizer: vi.fn((_name: string, callback: Authorizer["authorize"]) => {
        secondAuthorize = callback;
        return vi.fn();
      }),
    };
    (globalThis as Record<symbol, unknown>)[SERVICE_KEY] = new Map([
      ["session-1", firstService],
      ["session-2", secondService],
    ]);

    const pi = {
      registerCommand: (_name: string, definition: { handler: typeof command }) => {
        command = definition.handler;
      },
      on: (name: string, handler: (event: unknown, ctx: any) => unknown) => {
        lifecycle.set(name, handler);
      },
      events: {
        on: (name: string, handler: (event: unknown) => unknown) => {
          bus.set(name, handler);
        },
      },
    };
    const validConfig = {
      enabled: true,
      backend: { type: "jev" as const, endpoint: "http://localhost:11434/v1/systemone", model: "tev" },
      timeoutMs: 500,
      maxCommandBytes: 8192,
      allowThreshold: 0.9,
      denyThreshold: 0.98,
    };
    const load = vi.fn()
      .mockReturnValueOnce(validConfig)
      .mockImplementationOnce(() => { throw new Error("invalid replacement config"); });
    const setStatus = vi.fn();
    const notify = vi.fn();
    const context = { ui: { setStatus, notify }, modelRegistry: {} };

    createAutoModeExtension(pi as never, {
      configUrl: new URL("../config.json", import.meta.url),
      load,
      jev: async () => ({ decision: "allow", confidence: 1 }),
    });

    lifecycle.get("session_start")?.({}, context);
    bus.get("permissions:ready")?.({ sessionId: "session-1" });
    await expect(firstAuthorize?.(details(), {} as never, { review: vi.fn(), debug: vi.fn() }))
      .resolves.toEqual({ kind: "allow" });

    lifecycle.get("session_start")?.({}, context);
    expect(setStatus).toHaveBeenLastCalledWith(STATUS_KEY, "auto-mode: error (invalid config)");
    await expect(firstAuthorize?.(details(), {} as never, { review: vi.fn(), debug: vi.fn() }))
      .resolves.toEqual({ kind: "defer" });
    await command?.("on", context);
    expect(notify).toHaveBeenLastCalledWith(
      "Auto-mode configuration is invalid or unavailable",
      "warning",
    );

    bus.get("permissions:ready")?.({ sessionId: "session-2" });
    expect(firstDispose).toHaveBeenCalledOnce();
    await expect(secondAuthorize?.(details(), {} as never, { review: vi.fn(), debug: vi.fn() }))
      .resolves.toEqual({ kind: "defer" });
  });
});
