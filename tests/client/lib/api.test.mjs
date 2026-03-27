import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiRequest } from "../../../client/src/lib/api.js";

describe("apiRequest", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("apiRequest_ObjectBodyProvided_SerializesBodyAndSetsJsonHeaders", async () => {
    // Arrange
    const requestPath = "/api/login";
    const requestBody = {
      username: "alice_signal",
    };
    const traceHeaderValue = "trace-123";
    const expectedPayload = { authenticated: true };

    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(expectedPayload),
    });

    // Act
    const result = await apiRequest(requestPath, {
      method: "POST",
      body: requestBody,
      headers: {
        "X-Trace": traceHeaderValue,
      },
    });

    // Assert
    expect(result).toEqual(expectedPayload);
    expect(globalThis.fetch).toHaveBeenCalledWith(requestPath, {
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify(requestBody),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Trace": traceHeaderValue,
      },
    });
  });

  it("apiRequest_StringBodyProvided_PreservesOriginalBodyString", async () => {
    // Arrange
    const requestPath = "/api/raw";
    const requestBody = '{"already":"serialized"}';
    const expectedPayload = { ok: true };

    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(expectedPayload),
    });

    // Act
    await apiRequest(requestPath, {
      method: "POST",
      body: requestBody,
    });

    // Assert
    expect(globalThis.fetch).toHaveBeenCalledWith(requestPath, {
      method: "POST",
      credentials: "same-origin",
      body: requestBody,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  });

  it("apiRequest_NoContentResponse_ReturnsNull", async () => {
    // Arrange
    const requestPath = "/api/logout";
    const expectedResult = null;

    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: vi.fn(),
    });

    // Act
    const result = await apiRequest(requestPath, {
      method: "POST",
    });

    // Assert
    expect(result).toBe(expectedResult);
  });

  it("apiRequest_ErrorPayloadReturned_ThrowsApiErrorWithServerMessage", async () => {
    // Arrange
    const requestPath = "/api/login";
    const errorMessage = "Incorrect username or password.";
    const expectedStatusCode = 401;
    const expectedPayload = {
      error: errorMessage,
    };

    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: expectedStatusCode,
      json: vi.fn().mockResolvedValue(expectedPayload),
    });

    // Act
    const act = () => apiRequest(requestPath, { method: "POST" });

    // Assert
    await expect(act).rejects.toMatchObject({
      name: ApiError.name,
      message: errorMessage,
      statusCode: expectedStatusCode,
      payload: expectedPayload,
    });
  });

  it("apiRequest_InvalidJsonErrorResponse_ThrowsApiErrorWithFallbackMessage", async () => {
    // Arrange
    const requestPath = "/api/login";
    const expectedStatusCode = 500;
    const expectedMessage = `Request to ${requestPath} failed.`;

    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: expectedStatusCode,
      json: vi.fn().mockRejectedValue(new Error("invalid json")),
    });

    // Act
    const act = () => apiRequest(requestPath, { method: "POST" });

    // Assert
    await expect(act).rejects.toMatchObject({
      name: ApiError.name,
      message: expectedMessage,
      statusCode: expectedStatusCode,
      payload: {},
    });
  });
});
