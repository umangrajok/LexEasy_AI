/**
 * Bot Protection System for LexEasy
 * Multi-layer defense: IP rate limiting, user-agent checks, request pattern analysis
 */

const WINDOW_MS = Number(process.env.BOT_WINDOW_MS || 60_000); // 1 minute window
const IP_LIMIT = Number(process.env.BOT_IP_LIMIT || 8); // 8 req/min/IP by default
const BURST_WINDOW_MS = Number(process.env.BOT_BURST_WINDOW_MS || 5_000); // 5s window
const BURST_LIMIT = Number(process.env.BOT_BURST_LIMIT || 3); // max 3 req / 5s
const BLOCK_DURATION_MS = Number(process.env.BOT_BLOCK_MS || 10 * 60_000); // 10 min block

const requestsByIp = new Map<string, number[]>();
const burstByIp = new Map<string, number[]>();
const blockedIps = new Map<string, number>(); // ip -> unblock timestamp

export type BotCheckResult =
  | { ok: true }
  | { ok: false; status: 429 | 403; error: string; retryAfterSec?: number };

/** Extract real IP from request headers */
export function getClientIp(req: Request): string {
  const fwd = (req.headers as Headers).get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const realIp = (req.headers as Headers).get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

/** Permanently block an IP (until server restart or 10 min) */
function blockIp(ip: string) {
  blockedIps.set(ip, Date.now() + BLOCK_DURATION_MS);
}

/** Check if IP is currently blocked */
function isBlocked(ip: string): boolean {
  const unblockAt = blockedIps.get(ip);
  if (!unblockAt) return false;
  if (Date.now() > unblockAt) {
    blockedIps.delete(ip);
    return false;
  }
  return true;
}

function getRetryAfterSec(ip: string): number | undefined {
  const unblockAt = blockedIps.get(ip);
  if (!unblockAt) return undefined;
  return Math.max(1, Math.ceil((unblockAt - Date.now()) / 1000));
}

/** Check suspicious user-agent patterns */
function isSuspiciousUserAgent(ua: string | null): boolean {
  if (!ua) return true; // No UA = likely a bot
  const suspiciousPatterns = [
    /curl\//i,
    /python-requests/i,
    /axios\//i,
    /node-fetch/i,
    /got\//i,
    /wget\//i,
    /httpx/i,
    /scrapy/i,
    /phantomjs/i,
  ];
  return suspiciousPatterns.some((p) => p.test(ua));
}

function hasLikelyBrowserHeaders(req: Request): boolean {
  const headers = req.headers as Headers;
  const secFetchMode = headers.get("sec-fetch-mode");
  const secFetchSite = headers.get("sec-fetch-site");
  const acceptLanguage = headers.get("accept-language");
  const accept = headers.get("accept");
  return Boolean(secFetchMode && secFetchSite && acceptLanguage && accept?.includes("application/json"));
}

/** Main bot protection check - call this at start of every API handler */
export function checkBotProtection(req: Request): BotCheckResult {
  const rawIp = getClientIp(req);
  const ua = (req.headers as Headers).get("user-agent");
  const now = Date.now();
  // If IP is unavailable (common in some local/dev setups), make the key more specific.
  const ip = rawIp === "unknown" ? `unknown:${ua ?? "no-ua"}` : rawIp;

  // 1. Check if IP is already blocked
  if (isBlocked(ip)) {
    return {
      ok: false,
      status: 429,
      error: "Too many requests. Please try again later.",
      retryAfterSec: getRetryAfterSec(ip),
    };
  }

  // 2. Strong bot signal: suspicious UA + missing browser fetch headers.
  if (isSuspiciousUserAgent(ua) && !hasLikelyBrowserHeaders(req)) {
    blockIp(ip);
    return {
      ok: false,
      status: 403,
      error: "Access denied.",
      retryAfterSec: getRetryAfterSec(ip),
    };
  }

  // 3. Burst check — max 3 requests in 5 seconds
  const burstHistory = burstByIp.get(ip) || [];
  const recentBurst = burstHistory.filter((t) => now - t < BURST_WINDOW_MS);
  if (recentBurst.length >= BURST_LIMIT) {
    blockIp(ip); // Block rapid-fire bots
    return {
      ok: false,
      status: 429,
      error: "Too many rapid requests. Slow down.",
      retryAfterSec: getRetryAfterSec(ip),
    };
  }
  recentBurst.push(now);
  burstByIp.set(ip, recentBurst);

  // 4. Per-minute rate limit — 8 requests per minute
  const history = requestsByIp.get(ip) || [];
  const recent = history.filter((t) => now - t < WINDOW_MS);
  if (recent.length >= IP_LIMIT) {
    return {
      ok: false,
      status: 429,
      error: "Rate limit exceeded. Max 8 requests per minute.",
    };
  }
  recent.push(now);
  requestsByIp.set(ip, recent);

  return { ok: true };
}

/** Honeypot field check — if this field is present/filled, it's a bot */
export function isHoneypotTriggered(body: Record<string, unknown>): boolean {
  // Bots that fill all form fields will fill this fake "website" field
  const honeypot = body?.website ?? body?._hp ?? body?.phone_number_optional;
  return Boolean(honeypot);
}

/** Cleanup old entries to prevent memory leak (call periodically) */
export function cleanupBotProtectionMaps() {
  const now = Date.now();
  for (const [ip, times] of requestsByIp.entries()) {
    const recent = times.filter((t) => now - t < WINDOW_MS);
    if (recent.length === 0) requestsByIp.delete(ip);
    else requestsByIp.set(ip, recent);
  }
  for (const [ip, times] of burstByIp.entries()) {
    const recent = times.filter((t) => now - t < BURST_WINDOW_MS);
    if (recent.length === 0) burstByIp.delete(ip);
    else burstByIp.set(ip, recent);
  }
  for (const [ip, unblockAt] of blockedIps.entries()) {
    if (now > unblockAt) blockedIps.delete(ip);
  }
}

// Auto-cleanup every 5 minutes
if (typeof setInterval !== "undefined") {
  const timer = setInterval(cleanupBotProtectionMaps, 5 * 60_000);
  if (typeof (timer as { unref?: () => void }).unref === "function") {
    (timer as { unref: () => void }).unref();
  }
}
