const WINDOW_MS = 60_000;
const LIMIT = 5;
const requestsByKey = new Map<string, number[]>();

export function rateLimit(key: string) {
  const now = Date.now();
  const history = requestsByKey.get(key) || [];
  const recent = history.filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) return false;
  recent.push(now);
  requestsByKey.set(key, recent);
  return true;
}
