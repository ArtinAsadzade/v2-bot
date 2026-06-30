import { NativeXrayModule, XrayStartOptions } from "./types";
import { xrayStateManager } from "./state-manager";

export const NativeXrayModuleSpec: NativeXrayModule = {
  async start(_options: XrayStartOptions) { xrayStateManager.resetStats(); xrayStateManager.setState("starting"); return "starting"; },
  async stop() { xrayStateManager.setState("stopped"); return "stopped"; },
  async restart(options: XrayStartOptions) { await this.stop(); return this.start(options); },
  async getState() { return xrayStateManager.getState(); },
  async getStats() { return xrayStateManager.getStats(); },
  async ping() { return { ok: false, error: "Native bridge not linked" }; },
  async testTcpPing() { return { ok: false, error: "Native bridge not linked" }; },
  async testRealDelay() { return { ok: false, error: "Native bridge not linked" }; },
};

export * from "./types";
export * from "./parser";
export * from "./security";
