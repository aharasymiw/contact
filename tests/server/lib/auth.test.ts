import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../server/lib/db.ts", () => ({
  query: vi.fn(),
}));

vi.mock("../../../server/lib/security.ts", () => ({
  createSessionToken: vi.fn(),
  hashPassword: vi.fn(),
  hashSessionToken: vi.fn(),
  verifyPassword: vi.fn(),
}));

import { config } from "../../../server/lib/config.ts";
import {
  attachCurrentUser,
  clearSessionCookie,
  loginAccount,
  logoutSession,
  registerAccount,
  requireUser,
  serializeUser,
  setSessionCookie,
} from "../../../server/lib/auth.ts";
import { query } from "../../../server/lib/db.ts";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "../../../server/lib/security.ts";

function createMockResponse() {
  const response = {
    clearCookie: vi.fn(),
    cookie: vi.fn(),
    json: vi.fn(),
    status: vi.fn(),
  };

  response.status.mockReturnValue(response);

  return response;
}

function createQueryResult(overrides = {}) {
  return {
    command: "SELECT",
    rowCount: 0,
    oid: 0,
    fields: [],
    rows: [],
    ...overrides,
  } as any;
}

describe("auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serializeUser_DatabaseRowProvided_ReturnsClientShape", () => {
    // Arrange
    const databaseRow = {
      id: "user-1",
      username: "alice_signal",
      display_name: "Alice Signal",
      created_at: "2026-03-26T15:00:00.000Z",
    };
    const expectedUser = {
      id: "user-1",
      username: "alice_signal",
      displayName: "Alice Signal",
      createdAt: "2026-03-26T15:00:00.000Z",
    };

    // Act
    const result = serializeUser(databaseRow);

    // Assert
    expect(result).toEqual(expectedUser);
  });

  it("setSessionCookie_ValidToken_CallsCookieWithConfiguredOptions", () => {
    // Arrange
    const response = createMockResponse();
    const rawToken = "session-token";

    // Act
    setSessionCookie(response as any, rawToken);

    // Assert
    expect(response.cookie).toHaveBeenCalledWith(config.sessionCookieName, rawToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.isProduction,
      maxAge: config.sessionLifetimeMs,
      path: "/",
    });
  });

  it("clearSessionCookie_ResponseProvided_CallsClearCookieWithConfiguredOptions", () => {
    // Arrange
    const response = createMockResponse();

    // Act
    clearSessionCookie(response as any);

    // Assert
    expect(response.clearCookie).toHaveBeenCalledWith(config.sessionCookieName, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.isProduction,
      path: "/",
    });
  });

  it("requireUser_NoCurrentUser_SendsUnauthorizedError", () => {
    // Arrange
    const request = {
      currentUser: null,
    };
    const response = createMockResponse();
    const next = vi.fn();
    const expectedStatusCode = 401;
    const expectedPayload = {
      error: "You need to log in before using the live call lab.",
    };

    // Act
    requireUser(request as any, response as any, next);

    // Assert
    expect(response.status).toHaveBeenCalledWith(expectedStatusCode);
    expect(response.json).toHaveBeenCalledWith(expectedPayload);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireUser_CurrentUserPresent_CallsNextMiddleware", () => {
    // Arrange
    const request = {
      currentUser: {
        id: "user-1",
      },
    };
    const response = createMockResponse();
    const next = vi.fn();

    // Act
    requireUser(request as any, response as any, next);

    // Assert
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("registerAccount_InvalidUsername_Throws400ValidationError", async () => {
    // Arrange
    const invalidCredentials = {
      username: "Alice Signal",
      displayName: "Alice Signal",
      password: "contact-demo-123",
    };
    const expectedMessage =
      "Usernames must be 3-24 characters using lowercase letters, numbers, or underscores.";
    const expectedStatusCode = 400;

    // Act
    const act = () => registerAccount(invalidCredentials);

    // Assert
    await expect(act).rejects.toMatchObject({
      message: expectedMessage,
      statusCode: expectedStatusCode,
    });
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("registerAccount_DuplicateUsername_Throws409Error", async () => {
    // Arrange
    const validCredentials = {
      username: "alice_signal",
      displayName: "Alice Signal",
      password: "contact-demo-123",
    };
    const expectedMessage = "That username is already taken.";
    const expectedStatusCode = 409;

    vi.mocked(hashPassword).mockResolvedValue("password-hash");
    vi.mocked(query).mockRejectedValueOnce({ code: "23505" });

    // Act
    const act = () => registerAccount(validCredentials);

    // Assert
    await expect(act).rejects.toMatchObject({
      message: expectedMessage,
      statusCode: expectedStatusCode,
    });
  });

  it("registerAccount_ValidCredentials_ReturnsSessionTokenAndSerializedUser", async () => {
    // Arrange
    const validCredentials = {
      username: "Alice_Signal",
      displayName: "  Alice Signal  ",
      password: "contact-demo-123",
    };
    const expectedPasswordHash = "password-hash";
    const expectedSessionToken = "raw-session-token";
    const expectedSessionTokenHash = "hashed-session-token";
    const insertedUserRow = {
      id: "user-1",
      username: "alice_signal",
      display_name: "Alice Signal",
      created_at: "2026-03-26T15:00:00.000Z",
    };
    const expectedResult = {
      sessionToken: expectedSessionToken,
      user: {
        id: "user-1",
        username: "alice_signal",
        displayName: "Alice Signal",
        createdAt: "2026-03-26T15:00:00.000Z",
      },
    };

    vi.mocked(hashPassword).mockResolvedValue(expectedPasswordHash);
    vi.mocked(createSessionToken).mockReturnValue(expectedSessionToken);
    vi.mocked(hashSessionToken).mockReturnValue(expectedSessionTokenHash);
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [insertedUserRow],
      } as any)
      .mockResolvedValueOnce(createQueryResult());

    // Act
    const result = await registerAccount(validCredentials);

    // Assert
    expect(result).toEqual(expectedResult);
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining("insert into app_users"), [
      "alice_signal",
      "Alice Signal",
      expectedPasswordHash,
    ]);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("insert into user_sessions"), [
      "user-1",
      expectedSessionTokenHash,
      config.sessionLifetimeMs,
    ]);
  });

  it("loginAccount_UnknownUsername_Throws401Error", async () => {
    // Arrange
    const credentials = {
      username: "missing_user",
      password: "contact-demo-123",
    };
    const expectedMessage = "Incorrect username or password.";
    const expectedStatusCode = 401;

    vi.mocked(query).mockResolvedValueOnce(createQueryResult({ rowCount: 0 }));

    // Act
    const act = () => loginAccount(credentials);

    // Assert
    await expect(act).rejects.toMatchObject({
      message: expectedMessage,
      statusCode: expectedStatusCode,
    });
  });

  it("loginAccount_InvalidPassword_Throws401Error", async () => {
    // Arrange
    const credentials = {
      username: "alice_signal",
      password: "wrong-password",
    };
    const selectedUserRow = {
      id: "user-1",
      username: "alice_signal",
      display_name: "Alice Signal",
      created_at: "2026-03-26T15:00:00.000Z",
      password_hash: "stored-password-hash",
    };
    const expectedMessage = "Incorrect username or password.";
    const expectedStatusCode = 401;

    vi.mocked(query).mockResolvedValueOnce(
      createQueryResult({
        rowCount: 1,
        rows: [selectedUserRow],
      }),
    );
    vi.mocked(verifyPassword).mockResolvedValue(false);

    // Act
    const act = () => loginAccount(credentials);

    // Assert
    await expect(act).rejects.toMatchObject({
      message: expectedMessage,
      statusCode: expectedStatusCode,
    });
  });

  it("loginAccount_ValidCredentials_ReturnsSessionTokenAndSerializedUser", async () => {
    // Arrange
    const credentials = {
      username: "Alice_Signal",
      password: "contact-demo-123",
    };
    const selectedUserRow = {
      id: "user-1",
      username: "alice_signal",
      display_name: "Alice Signal",
      created_at: "2026-03-26T15:00:00.000Z",
      password_hash: "stored-password-hash",
    };
    const expectedSessionToken = "raw-session-token";
    const expectedSessionTokenHash = "hashed-session-token";
    const expectedResult = {
      sessionToken: expectedSessionToken,
      user: {
        id: "user-1",
        username: "alice_signal",
        displayName: "Alice Signal",
        createdAt: "2026-03-26T15:00:00.000Z",
      },
    };

    vi.mocked(query)
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [selectedUserRow],
      } as any)
      .mockResolvedValueOnce(createQueryResult());
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(createSessionToken).mockReturnValue(expectedSessionToken);
    vi.mocked(hashSessionToken).mockReturnValue(expectedSessionTokenHash);

    // Act
    const result = await loginAccount(credentials);

    // Assert
    expect(result).toEqual(expectedResult);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("insert into user_sessions"), [
      "user-1",
      expectedSessionTokenHash,
      config.sessionLifetimeMs,
    ]);
  });

  it("logoutSession_NoSessionId_DoesNotQueryDatabase", async () => {
    // Arrange
    const missingSessionId = null;

    // Act
    await logoutSession(missingSessionId);

    // Assert
    expect(query).not.toHaveBeenCalled();
  });

  it("logoutSession_SessionIdProvided_DeletesSession", async () => {
    // Arrange
    const sessionId = "session-1";
    vi.mocked(query).mockResolvedValueOnce(createQueryResult());

    // Act
    await logoutSession(sessionId);

    // Assert
    expect(query).toHaveBeenCalledWith(expect.stringContaining("delete from user_sessions"), [
      sessionId,
    ]);
  });

  it("attachCurrentUser_NoCookieHeader_CallsNextWithoutDatabaseQuery", async () => {
    // Arrange
    const request: any = {
      headers: {},
    };
    const response = createMockResponse();
    const next = vi.fn();

    // Act
    await attachCurrentUser(request as any, response as any, next);

    // Assert
    expect(request.currentUser).toBeNull();
    expect(request.sessionId).toBeNull();
    expect(query).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it("attachCurrentUser_SessionNotFound_ClearsCookieAndCallsNext", async () => {
    // Arrange
    const rawSessionToken = "raw-session-token";
    const hashedSessionToken = "hashed-session-token";
    const request: any = {
      headers: {
        cookie: `${config.sessionCookieName}=${rawSessionToken}`,
      },
    };
    const response = createMockResponse();
    const next = vi.fn();

    vi.mocked(hashSessionToken).mockReturnValue(hashedSessionToken);
    vi.mocked(query).mockResolvedValueOnce(createQueryResult({ rowCount: 0 }));

    // Act
    await attachCurrentUser(request as any, response as any, next);

    // Assert
    expect(response.clearCookie).toHaveBeenCalledWith(
      config.sessionCookieName,
      expect.objectContaining({
        httpOnly: true,
      }),
    );
    expect(next).toHaveBeenCalledWith();
  });

  it("attachCurrentUser_ValidSession_SetsUserAndRefreshesLastSeen", async () => {
    // Arrange
    const rawSessionToken = "raw-session-token";
    const hashedSessionToken = "hashed-session-token";
    const request: any = {
      headers: {
        cookie: `${config.sessionCookieName}=${rawSessionToken}`,
      },
    };
    const response = createMockResponse();
    const next = vi.fn();
    const sessionRow = {
      session_id: "session-1",
      id: "user-1",
      username: "alice_signal",
      display_name: "Alice Signal",
      created_at: "2026-03-26T15:00:00.000Z",
    };
    const expectedUser = {
      id: "user-1",
      username: "alice_signal",
      displayName: "Alice Signal",
      createdAt: "2026-03-26T15:00:00.000Z",
    };

    vi.mocked(hashSessionToken).mockReturnValue(hashedSessionToken);
    vi.mocked(query)
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [sessionRow],
      } as any)
      .mockResolvedValueOnce(createQueryResult());

    // Act
    await attachCurrentUser(request as any, response as any, next);

    // Assert
    expect(request.currentUser).toEqual(expectedUser);
    expect(request.sessionId).toBe("session-1");
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("update user_sessions"), [
      "session-1",
    ]);
    expect(next).toHaveBeenCalledWith();
  });

  it("attachCurrentUser_QueryFails_PassesErrorToNext", async () => {
    // Arrange
    const rawSessionToken = "raw-session-token";
    const hashedSessionToken = "hashed-session-token";
    const request: any = {
      headers: {
        cookie: `${config.sessionCookieName}=${rawSessionToken}`,
      },
    };
    const response = createMockResponse();
    const next = vi.fn();
    const expectedError = new Error("database offline");

    vi.mocked(hashSessionToken).mockReturnValue(hashedSessionToken);
    vi.mocked(query).mockRejectedValueOnce(expectedError);

    // Act
    await attachCurrentUser(request as any, response as any, next);

    // Assert
    expect(next).toHaveBeenCalledWith(expectedError);
  });
});
