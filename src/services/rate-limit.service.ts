export type RateLimitGroup =
  | "admin"
  | "navigation"
  | "callbacks"
  | "payments"
  | "purchase"
  | "reward"
  | "prediction"
  | "support"
  | "search"
  | "background";

export type UserRole = "user" | "admin" | "superadmin";

export type RateLimitPolicy = {
  limit: number;
  windowMs: number;
  blockMs: number;
};

type Entry = { hits: number[]; blockedUntil?: number; lastWarningAt?: number };

export type RateLimitDecision = {
  allowed: boolean;
  group: RateLimitGroup;
  count: number;
  limit: number;
  blockedUntil?: number;
  retryAfterSeconds?: number;
  warningAllowed: boolean;
};

const envNumber = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const seconds = (name: string, fallback: number) => envNumber(name, fallback) * 1000;

export const RATE_LIMIT_POLICIES: Record<RateLimitGroup, RateLimitPolicy> = {
  // Safety net only: admins should not experience UX throttling.
  admin: { limit: envNumber("ADMIN_RATE_LIMIT_PER_SECOND", 100), windowMs: 1_000, blockMs: 1_000 },
  navigation: { limit: envNumber("NAVIGATION_RATE_LIMIT", 120), windowMs: seconds("NAVIGATION_RATE_LIMIT_WINDOW_SECONDS", 10), blockMs: seconds("NAVIGATION_RATE_LIMIT_BLOCK_SECONDS", 2) },
  callbacks: { limit: envNumber("CALLBACK_RATE_LIMIT", 60), windowMs: seconds("CALLBACK_RATE_LIMIT_WINDOW_SECONDS", 10), blockMs: seconds("CALLBACK_RATE_LIMIT_BLOCK_SECONDS", 5) },
  payments: { limit: envNumber("PAYMENT_RATE_LIMIT", 30), windowMs: seconds("PAYMENT_RATE_LIMIT_WINDOW_SECONDS", 60), blockMs: seconds("PAYMENT_RATE_LIMIT_BLOCK_SECONDS", 5) },
  purchase: { limit: envNumber("PURCHASE_RATE_LIMIT", 80), windowMs: seconds("PURCHASE_RATE_LIMIT_WINDOW_SECONDS", 60), blockMs: seconds("PURCHASE_RATE_LIMIT_BLOCK_SECONDS", 5) },
  reward: { limit: envNumber("REWARD_RATE_LIMIT", 30), windowMs: seconds("REWARD_RATE_LIMIT_WINDOW_SECONDS", 30), blockMs: seconds("REWARD_RATE_LIMIT_BLOCK_SECONDS", 3) },
  prediction: { limit: envNumber("PREDICTION_RATE_LIMIT", 60), windowMs: seconds("PREDICTION_RATE_LIMIT_WINDOW_SECONDS", 30), blockMs: seconds("PREDICTION_RATE_LIMIT_BLOCK_SECONDS", 3) },
  support: { limit: envNumber("SUPPORT_RATE_LIMIT", 20), windowMs: seconds("SUPPORT_RATE_LIMIT_WINDOW_SECONDS", 30), blockMs: seconds("SUPPORT_RATE_LIMIT_BLOCK_SECONDS", 5) },
  search: { limit: envNumber("SEARCH_RATE_LIMIT", 20), windowMs: seconds("SEARCH_RATE_LIMIT_WINDOW_SECONDS", 10), blockMs: seconds("SEARCH_RATE_LIMIT_BLOCK_SECONDS", 3) },
  background: { limit: envNumber("BACKGROUND_RATE_LIMIT", 1_000), windowMs: seconds("BACKGROUND_RATE_LIMIT_WINDOW_SECONDS", 60), blockMs: seconds("BACKGROUND_RATE_LIMIT_BLOCK_SECONDS", 1) },
};

export class RateLimitService {
  private readonly entries = new Map<string, Entry>();
  constructor(private readonly policies: Record<RateLimitGroup, RateLimitPolicy> = RATE_LIMIT_POLICIES) {}

  consume(input: { subject: string; group: RateLimitGroup; role?: UserRole; now?: number }): RateLimitDecision {
    const group = input.role === "admin" || input.role === "superadmin" ? "admin" : input.group;
    const policy = this.policies[group];
    const now = input.now ?? Date.now();
    const key = `${input.subject}:${group}`;
    const entry = this.entries.get(key) ?? { hits: [] };
    entry.hits = entry.hits.filter((timestamp) => now - timestamp < policy.windowMs);

    if (entry.blockedUntil && entry.blockedUntil > now) {
      this.entries.set(key, entry);
      return this.blocked(group, entry, policy, now);
    }

    entry.blockedUntil = undefined;
    entry.hits.push(now);
    if (entry.hits.length > policy.limit) {
      entry.blockedUntil = now + policy.blockMs;
      this.entries.set(key, entry);
      return this.blocked(group, entry, policy, now);
    }

    this.entries.set(key, entry);
    return { allowed: true, group, count: entry.hits.length, limit: policy.limit, warningAllowed: false };
  }

  markWarned(input: { subject: string; group: RateLimitGroup; role?: UserRole; now?: number }) {
    const group = input.role === "admin" || input.role === "superadmin" ? "admin" : input.group;
    const key = `${input.subject}:${group}`;
    const entry = this.entries.get(key) ?? { hits: [] };
    entry.lastWarningAt = input.now ?? Date.now();
    this.entries.set(key, entry);
  }

  reset() { this.entries.clear(); }

  private blocked(group: RateLimitGroup, entry: Entry, policy: RateLimitPolicy, now: number): RateLimitDecision {
    const retryAfterSeconds = entry.blockedUntil ? Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000)) : undefined;
    return { allowed: false, group, count: entry.hits.length, limit: policy.limit, blockedUntil: entry.blockedUntil, retryAfterSeconds, warningAllowed: !entry.lastWarningAt || now - entry.lastWarningAt >= 10_000 };
  }
}

export const rateLimitService = new RateLimitService();
