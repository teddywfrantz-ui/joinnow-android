import type { NextFunction, Request, Response } from "express";

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function configuredOrigins(): Set<string> {
  const origins = new Set<string>([
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5000",
  ]);

  for (const entry of [
    process.env.CORS_ORIGINS,
    process.env.REPLIT_DOMAINS,
    process.env.REPLIT_DEV_DOMAIN,
    process.env.EXPO_PUBLIC_DOMAIN,
  ]) {
    for (const value of entry?.split(",") ?? []) {
      const trimmed = value.trim();
      if (!trimmed) continue;
      origins.add(normalizeOrigin(trimmed.includes("://") ? trimmed : `https://${trimmed}`));
    }
  }

  return origins;
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  return !origin || configuredOrigins().has(normalizeOrigin(origin));
}

export function corsOrigin(origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
  } else {
    callback(new Error("Origin is not allowed"));
  }
}

/**
 * Cookie-authenticated state changes need a same-origin signal. Browsers send
 * Origin for fetch requests, while native/test clients may omit it; those
 * clients are still protected by the session/JWT authorization checks.
 */
export function enforceSameOrigin(req: Request, res: Response, next: NextFunction) {
  if (!stateChangingMethods.has(req.method)) return next();
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const referer = typeof req.headers.referer === "string" ? req.headers.referer : undefined;
  let requestOrigin = origin;
  if (!requestOrigin && referer) {
    try {
      requestOrigin = new URL(referer).origin;
    } catch {
      return res.status(403).json({ error: "Invalid request origin" });
    }
  }

  if (requestOrigin && !isAllowedOrigin(requestOrigin)) {
    return res.status(403).json({ error: "Cross-origin request blocked" });
  }
  next();
}

type Bucket = { count: number; resetAt: number };

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
}) {
  const buckets = new Map<string, Bucket>();
  const keyFor = options.key ?? ((req) => req.ip || req.socket.remoteAddress || "unknown");

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = keyFor(req);
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + options.windowMs }
      : current;

    bucket.count += 1;
    buckets.set(key, bucket);

    if (buckets.size > 10_000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }

    res.setHeader("RateLimit-Limit", options.max);
    res.setHeader("RateLimit-Remaining", Math.max(0, options.max - bucket.count));
    res.setHeader("RateLimit-Reset", Math.ceil(bucket.resetAt / 1000));

    if (bucket.count > options.max) {
      res.setHeader("Retry-After", Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    next();
  };
}