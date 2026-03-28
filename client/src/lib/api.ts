import type { ZodType } from "zod";

export class ApiError extends Error {
  statusCode: number;
  payload: unknown;

  constructor(message: string, statusCode: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: BodyInit | Record<string, unknown> | unknown[] | null;
  headers?: HeadersInit;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
  schema?: ZodType<T>,
): Promise<T | null> {
  const serializedBody: BodyInit | undefined =
    options.body && typeof options.body !== "string"
      ? JSON.stringify(options.body)
      : (options.body as BodyInit | undefined);

  const requestOptions = {
    method: "GET",
    credentials: "same-origin",
    ...options,
    body: serializedBody,
    headers: {
      Accept: "application/json",
      ...(serializedBody ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  } satisfies RequestInit;

  const response = await fetch(path, requestOptions);

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(payload.error ?? `Request to ${path} failed.`, response.status, payload);
  }

  return schema ? schema.parse(payload) : (payload as T);
}
