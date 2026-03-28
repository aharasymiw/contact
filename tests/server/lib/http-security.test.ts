import { describe, expect, it, vi } from "vitest";

import {
  buildContentSecurityPolicy,
  createSecurityHeadersMiddleware,
  createTrustedOriginMiddleware,
  hasTrustedOrigin,
  resolveAllowedOrigin,
} from "../../../server/lib/http-security.ts";

function createMockResponse() {
  const headers = new Map<string, string>();

  const response = {
    hasHeader: vi.fn((name: string) => headers.has(name.toLowerCase())),
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

describe("http-security", () => {
  it("buildContentSecurityPolicy_DevelopmentMode_IncludesDevScriptAllowances", () => {
    // Arrange
    const expectedScriptDirective = "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

    // Act
    const result = buildContentSecurityPolicy({ isProduction: false });

    // Assert
    expect(result).toContain(expectedScriptDirective);
  });

  it("resolveAllowedOrigin_NoConfiguredOrigin_ReturnsRequestOrigin", () => {
    // Arrange
    const request = {
      get: vi.fn().mockReturnValue("contact.local:3000"),
      protocol: "https",
    };
    const expectedOrigin = "https://contact.local:3000";

    // Act
    const result = resolveAllowedOrigin(request as any);

    // Assert
    expect(result).toBe(expectedOrigin);
  });

  it("hasTrustedOrigin_MatchingOriginHeader_ReturnsTrue", () => {
    // Arrange
    const request = {
      get: vi.fn((name: string) => {
        if (name === "origin") {
          return "https://contact.local:3000";
        }

        if (name === "host") {
          return "contact.local:3000";
        }

        return undefined;
      }),
      protocol: "https",
    };
    const options = {
      appOrigin: undefined,
      environment: "production",
    } as const;

    // Act
    const result = hasTrustedOrigin(request as any, options);

    // Assert
    expect(result).toBe(true);
  });

  it("createTrustedOriginMiddleware_UnsafeMethodWithoutTrustedOrigin_Returns403", () => {
    // Arrange
    const middleware = createTrustedOriginMiddleware({
      appOrigin: "https://contact.local:3000",
      environment: "production",
    });
    const request = {
      get: vi.fn((name: string) => {
        if (name === "origin") {
          return "https://evil.example";
        }

        if (name === "host") {
          return "contact.local:3000";
        }

        return undefined;
      }),
      method: "POST",
      protocol: "https",
    };
    const { response } = createMockResponse();
    const next = vi.fn();
    const expectedStatusCode = 403;
    const expectedPayload = {
      error: "Cross-site requests are not allowed for this endpoint.",
    };

    // Act
    middleware(request as any, response as any, next);

    // Assert
    expect(response.status).toHaveBeenCalledWith(expectedStatusCode);
    expect(response.json).toHaveBeenCalledWith(expectedPayload);
    expect(next).not.toHaveBeenCalled();
  });

  it("createSecurityHeadersMiddleware_SecureApiRequest_SetsHeadersAndHsts", () => {
    // Arrange
    const middleware = createSecurityHeadersMiddleware({
      isProduction: true,
    });
    const request = {
      path: "/api/login",
      secure: true,
    };
    const { headers, response } = createMockResponse();
    const next = vi.fn();
    const expectedCacheControl = "no-store";
    const expectedHsts = "max-age=15552000; includeSubDomains";

    // Act
    middleware(request as any, response as any, next);

    // Assert
    expect(headers.get("cache-control")).toBe(expectedCacheControl);
    expect(headers.get("strict-transport-security")).toBe(expectedHsts);
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(next).toHaveBeenCalledTimes(1);
  });
});
