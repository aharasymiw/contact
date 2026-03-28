import { describe, expect, it, vi } from "vitest";

import { createInMemoryRateLimiter } from "../../../server/lib/rate-limit.ts";

function createMockResponse() {
  const headers = new Map<string, string>();

  const response = {
    json: vi.fn(),
    setHeader: vi.fn((name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
    }),
    status: vi.fn(),
  };

  response.status.mockReturnValue(response);

  return {
    headers,
    response,
  };
}

describe("rate-limit", () => {
  it("createInMemoryRateLimiter_FirstAttemptWithinWindow_AllowsRequest", () => {
    // Arrange
    let currentTime = 1_000;
    const limiter = createInMemoryRateLimiter({
      maxAttempts: 2,
      windowMs: 5_000,
      message: "Too many attempts.",
      now: () => currentTime,
    });
    const expectedDecision = {
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 5,
    };

    // Act
    const result = limiter.consume("127.0.0.1");

    // Assert
    expect(result).toEqual(expectedDecision);
  });

  it("createInMemoryRateLimiter_AttemptOverLimit_BlocksRequest", () => {
    // Arrange
    const limiter = createInMemoryRateLimiter({
      maxAttempts: 1,
      windowMs: 5_000,
      message: "Too many attempts.",
      now: () => 1_000,
    });
    const expectedAllowed = false;
    limiter.consume("127.0.0.1");

    // Act
    const result = limiter.consume("127.0.0.1");

    // Assert
    expect(result.allowed).toBe(expectedAllowed);
    expect(result.remaining).toBe(0);
  });

  it("createInMemoryRateLimiter_WindowElapsed_ResetsCounter", () => {
    // Arrange
    let currentTime = 1_000;
    const limiter = createInMemoryRateLimiter({
      maxAttempts: 1,
      windowMs: 5_000,
      message: "Too many attempts.",
      now: () => currentTime,
    });
    const expectedAllowed = true;
    limiter.consume("127.0.0.1");
    currentTime = 7_000;

    // Act
    const result = limiter.consume("127.0.0.1");

    // Assert
    expect(result.allowed).toBe(expectedAllowed);
    expect(result.remaining).toBe(0);
  });

  it("middleware_ExceededLimit_SetsRetryAfterAndReturns429", () => {
    // Arrange
    const limiter = createInMemoryRateLimiter({
      maxAttempts: 1,
      windowMs: 10_000,
      message: "Too many login attempts.",
      now: () => 1_000,
    });
    const middleware = limiter.middleware((request) => request.ip);
    const request = {
      ip: "127.0.0.1",
    };
    const { headers, response } = createMockResponse();
    const next = vi.fn();
    const expectedStatusCode = 429;
    const expectedPayload = {
      error: "Too many login attempts.",
    };

    middleware(request as any, response as any, next);

    // Act
    middleware(request as any, response as any, next);

    // Assert
    expect(response.status).toHaveBeenCalledWith(expectedStatusCode);
    expect(response.json).toHaveBeenCalledWith(expectedPayload);
    expect(headers.get("retry-after")).toBe("10");
    expect(next).toHaveBeenCalledTimes(1);
  });
});
