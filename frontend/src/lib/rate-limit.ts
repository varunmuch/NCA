import "server-only";

import { headers } from "next/headers";

/**
 * Small in-memory, per-IP limiter for the sign-in forms. The backend
 * already locks an account after repeated wrong passwords; this slows
 * down one client trying many accounts or creating many accounts.
 *
 * In-memory is enough for the single Next.js process this app runs as.
 */

const LIMITS = {
  login: { max: 20, windowMs: 10 * 60 * 1000 },
  signup: { max: 5, windowMs: 60 * 60 * 1000 },
  link: { max: 10, windowMs: 10 * 60 * 1000 },
  reset: { max: 10, windowMs: 60 * 60 * 1000 },
} as const;

type Bucket = keyof typeof LIMITS;

const hits = new Map<string, number[]>();

async function clientIp(): Promise<string> {
  const list = await headers();

  // The server appends the real peer address last, so a client-supplied
  // X-Forwarded-For prefix can't pick a fresh bucket.
  const forwarded = list.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean);

  return forwarded?.at(-1) || list.get("x-real-ip") || "unknown";
}

export async function isRateLimited(bucket: Bucket): Promise<boolean> {
  const { max, windowMs } = LIMITS[bucket];
  const key = `${bucket}:${await clientIp()}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);

  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }

  recent.push(now);
  hits.set(key, recent);

  // Keep the map from growing without bound.
  if (hits.size > 10_000) {
    for (const [entry, times] of hits) {
      if (times.every((time) => now - time >= windowMs)) {
        hits.delete(entry);
      }
    }
  }

  return false;
}
