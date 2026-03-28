import type { NextFunction, Request, Response } from "express";

interface SecurityHeadersOptions {
  isProduction: boolean;
}

interface TrustedOriginOptions {
  appOrigin?: string;
  environment: "development" | "production" | "test";
}

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function buildContentSecurityPolicy({ isProduction }: SecurityHeadersOptions): string {
  const scriptSources = isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"];
  const connectSources = isProduction ? ["'self'"] : ["'self'", "http:", "https:", "ws:", "wss:"];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob: data:",
    `connect-src ${connectSources.join(" ")}`,
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ].join("; ");
}

export function resolveAllowedOrigin(request: Request, configuredOrigin?: string): string {
  if (configuredOrigin) {
    return configuredOrigin;
  }

  return `${request.protocol}://${request.get("host")}`;
}

export function parseOriginHeader(value?: string): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function hasTrustedOrigin(
  request: Request,
  { appOrigin, environment }: TrustedOriginOptions,
): boolean {
  const allowedOrigin = resolveAllowedOrigin(request, appOrigin);
  const requestOrigin = parseOriginHeader(request.get("origin"));

  if (requestOrigin) {
    return requestOrigin === allowedOrigin;
  }

  const refererOrigin = parseOriginHeader(request.get("referer"));

  if (refererOrigin) {
    return refererOrigin === allowedOrigin;
  }

  return environment !== "production";
}

export function createSecurityHeadersMiddleware(options: SecurityHeadersOptions) {
  const contentSecurityPolicy = buildContentSecurityPolicy(options);

  return (request: Request, response: Response, next: NextFunction) => {
    response.setHeader("Content-Security-Policy", contentSecurityPolicy);
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    response.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");

    if (request.path.startsWith("/api") && !response.hasHeader("Cache-Control")) {
      response.setHeader("Cache-Control", "no-store");
    }

    if (request.secure) {
      response.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }

    next();
  };
}

export function createTrustedOriginMiddleware(options: TrustedOriginOptions) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (safeMethods.has(request.method)) {
      next();
      return;
    }

    if (hasTrustedOrigin(request, options)) {
      next();
      return;
    }

    response.status(403).json({
      error: "Cross-site requests are not allowed for this endpoint.",
    });
  };
}
