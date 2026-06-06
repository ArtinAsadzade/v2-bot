const cache = new Map<string, number>();

export function rateLimit(userId: string, windowMs = 1000) {
  const now = Date.now();
  const last = cache.get(userId);

  if (last && now - last < windowMs) {
    return false;
  }

  cache.set(userId, now);
  return true;
}
