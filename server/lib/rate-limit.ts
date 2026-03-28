import type { NextFunction, Request, Response } from "express";

interface RateLimitOptions {
  maxAttempts: number;
  windowMs: number;
  message: string;
  now?: () => number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function createInMemoryRateLimiter({
  maxAttempts,
  windowMs,
  message,
  now = () => Date.now(),
}: RateLimitOptions) {
  const entries = new Map<string, RateLimitEntry>();

  function consume(key: string): RateLimitDecision {
    const currentTime = now();
    const currentEntry = entries.get(key);

    if (!currentEntry || currentEntry.resetAt <= currentTime) {
      entries.set(key, {
        count: 1,
        resetAt: currentTime + windowMs,
      });

      return {
        allowed: true,
        remaining: Math.max(maxAttempts - 1, 0),
        retryAfterSeconds: Math.ceil(windowMs / 1000),
      };
    }

    currentEntry.count += 1;
    entries.set(key, currentEntry);

    return {
      allowed: currentEntry.count <= maxAttempts,
      remaining: Math.max(maxAttempts - currentEntry.count, 0),
      retryAfterSeconds: Math.max(Math.ceil((currentEntry.resetAt - currentTime) / 1000), 1),
    };
  }

  function reset() {
    entries.clear();
  }

  function middleware(resolveKey: (request: Request) => string) {
    return (request: Request, response: Response, next: NextFunction) => {
      const decision = consume(resolveKey(request));
      response.setHeader("X-RateLimit-Limit", String(maxAttempts));
      response.setHeader("X-RateLimit-Remaining", String(decision.remaining));

      if (decision.allowed) {
        next();
        return;
      }

      response.setHeader("Retry-After", String(decision.retryAfterSeconds));
      response.status(429).json({
        error: message,
      });
    };
  }

  return {
    consume,
    middleware,
    reset,
  };
}
