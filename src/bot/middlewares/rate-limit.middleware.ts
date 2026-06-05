const cache = new Map();

export function rateLimit(userId: string) {
  const now = Date.now();

  const last = cache.get(userId);

  if (last && now - last < 1000) {
    return false;
  }

  cache.set(userId, now);

  return true;
}
