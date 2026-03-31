import crypto from "node:crypto";

type CacheValue = { expiresAt: number; payload: unknown };

const responseCache = new Map<string, CacheValue>();
const CACHE_TTL = 30 * 60 * 1000;

export function cacheKey(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function getCached<T>(key: string): T | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return entry.payload as T;
}

export function setCached(key: string, payload: unknown) {
  responseCache.set(key, { payload, expiresAt: Date.now() + CACHE_TTL });
}
