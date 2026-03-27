export class ApiError extends Error {
  constructor(message, statusCode, payload) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

export async function apiRequest(path, options = {}) {
  const requestOptions = {
    method: "GET",
    credentials: "same-origin",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  };

  if (options.body && typeof options.body !== "string") {
    requestOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, requestOptions);

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(payload.error ?? `Request to ${path} failed.`, response.status, payload);
  }

  return payload;
}
