import { EventEmitter } from "events";
import { XrayConnectionState, XrayStats } from "./types";

export class XrayStateManager extends EventEmitter {
  private state: XrayConnectionState = "idle";
  private stats: XrayStats = { uploadBytes: 0, downloadBytes: 0, updatedAt: Date.now() };

  getState() { return this.state; }
  setState(state: XrayConnectionState) { this.state = state; this.emit("state", state); }
  getStats() { return { ...this.stats }; }
  setStats(stats: Partial<XrayStats>) {
    this.stats = { ...this.stats, ...stats, updatedAt: Date.now() };
    this.emit("stats", this.getStats());
  }
  resetStats() { this.stats = { uploadBytes: 0, downloadBytes: 0, startedAt: Date.now(), updatedAt: Date.now() }; }
}

export const xrayStateManager = new XrayStateManager();
