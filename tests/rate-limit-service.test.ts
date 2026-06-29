import { describe, expect, it } from "vitest";
import { RateLimitService, type RateLimitPolicy } from "../src/services/rate-limit.service";

const policy = (limit: number): RateLimitPolicy => ({ limit, windowMs: 1_000, blockMs: 2_000 });
const policies = {
  admin: policy(100),
  navigation: policy(5),
  callbacks: policy(2),
  payments: policy(4),
  purchase: policy(4),
  reward: policy(3),
  prediction: policy(3),
  support: policy(3),
  search: policy(3),
  background: policy(100),
};

describe("RateLimitService adaptive policies", () => {
  it("admin never hits normal limiter and only keeps a high safety limit", () => {
    const limiter = new RateLimitService(policies);
    for (let i = 0; i < 100; i++) {
      expect(limiter.consume({ subject: "1", group: "navigation", role: "admin", now: 0 }).allowed).toBe(true);
    }
    const blocked = limiter.consume({ subject: "1", group: "navigation", role: "admin", now: 0 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.group).toBe("admin");
  });

  it("superadmin uses the same high safety policy", () => {
    const limiter = new RateLimitService(policies);
    for (let i = 0; i < 100; i++) {
      expect(limiter.consume({ subject: "2", group: "purchase", role: "superadmin", now: 0 }).allowed).toBe(true);
    }
  });

  it("normal navigation has its own forgiving policy independent from callback spam", () => {
    const limiter = new RateLimitService(policies);
    expect(limiter.consume({ subject: "3", group: "callbacks", now: 0 }).allowed).toBe(true);
    expect(limiter.consume({ subject: "3", group: "callbacks", now: 0 }).allowed).toBe(true);
    expect(limiter.consume({ subject: "3", group: "callbacks", now: 0 }).allowed).toBe(false);

    for (let i = 0; i < 5; i++) {
      expect(limiter.consume({ subject: "3", group: "navigation", now: 0 }).allowed).toBe(true);
    }
  });

  it("payment and purchase flows are not affected by callback limiter", () => {
    const limiter = new RateLimitService(policies);
    expect(limiter.consume({ subject: "4", group: "callbacks", now: 0 }).allowed).toBe(true);
    expect(limiter.consume({ subject: "4", group: "callbacks", now: 0 }).allowed).toBe(true);
    expect(limiter.consume({ subject: "4", group: "callbacks", now: 0 }).allowed).toBe(false);

    expect(limiter.consume({ subject: "4", group: "payments", now: 0 }).allowed).toBe(true);
    expect(limiter.consume({ subject: "4", group: "purchase", now: 0 }).allowed).toBe(true);
  });

  it("spam burst is blocked and remaining wait time is exposed", () => {
    const limiter = new RateLimitService(policies);
    limiter.consume({ subject: "5", group: "callbacks", now: 10_000 });
    limiter.consume({ subject: "5", group: "callbacks", now: 10_000 });
    const blocked = limiter.consume({ subject: "5", group: "callbacks", now: 10_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(2);
    expect(blocked.warningAllowed).toBe(true);
  });

  it("background jobs have an independent high policy", () => {
    const limiter = new RateLimitService(policies);
    for (let i = 0; i < 100; i++) {
      expect(limiter.consume({ subject: "job", group: "background", now: 0 }).allowed).toBe(true);
    }
  });
});
