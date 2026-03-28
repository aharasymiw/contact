import type { NextFunction, Request, Response } from "express";

import type { User } from "../../shared/schemas.ts";
import { config } from "./config.ts";
import { parseCookieHeader } from "./cookies.ts";
import { query } from "./db.ts";
import { createSessionToken, hashPassword, hashSessionToken, verifyPassword } from "./security.ts";
import {
  createHttpError,
  loginCredentialsSchema,
  parseOrThrow,
  registerCredentialsSchema,
} from "./validation.ts";

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  created_at: string;
}

interface SessionLookupRow extends UserRow {
  session_id: string;
}

interface PasswordUserRow extends UserRow {
  password_hash: string;
}

export type AppRequest = Request & {
  currentUser: User | null;
  sessionId: string | null;
};

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function serializeUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

export function setSessionCookie(response: Response, rawToken: string): void {
  response.cookie(config.sessionCookieName, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    maxAge: config.sessionLifetimeMs,
    path: "/",
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(config.sessionCookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
  });
}

async function insertSession(userId: string): Promise<string> {
  const rawToken = createSessionToken();
  const tokenHash = hashSessionToken(rawToken);

  await query(
    `
      insert into user_sessions (user_id, token_hash, expires_at)
      values ($1, $2, now() + ($3::bigint * interval '1 millisecond'))
    `,
    [userId, tokenHash, config.sessionLifetimeMs],
  );

  return rawToken;
}

export async function attachCurrentUser(
  request: AppRequest,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    request.currentUser = null;
    request.sessionId = null;

    const cookies = parseCookieHeader(request.headers.cookie);
    const rawSessionToken = cookies[config.sessionCookieName];

    if (!rawSessionToken) {
      next();
      return;
    }

    const tokenHash = hashSessionToken(rawSessionToken);
    const result = await query<SessionLookupRow>(
      `
        select
          user_sessions.id as session_id,
          app_users.id,
          app_users.username,
          app_users.display_name,
          app_users.created_at
        from user_sessions
        join app_users on app_users.id = user_sessions.user_id
        where user_sessions.token_hash = $1
          and user_sessions.expires_at > now()
      `,
      [tokenHash],
    );

    if ((result.rowCount ?? 0) === 0) {
      clearSessionCookie(response);
      next();
      return;
    }

    const [row] = result.rows;
    request.currentUser = serializeUser(row);
    request.sessionId = row.session_id;

    await query(
      `
        update user_sessions
        set last_seen_at = now()
        where id = $1
      `,
      [row.session_id],
    );

    next();
  } catch (error) {
    next(error);
  }
}

export function requireUser(request: AppRequest, response: Response, next: NextFunction): void {
  if (!request.currentUser) {
    response.status(401).json({
      error: "You need to log in before using the live call lab.",
    });
    return;
  }

  next();
}

export async function registerAccount(credentials: unknown): Promise<{
  sessionToken: string;
  user: User;
}> {
  const { username, displayName, password } = parseOrThrow(
    registerCredentialsSchema,
    credentials,
    "The registration payload is invalid.",
  );

  const normalizedUsername = normalizeUsername(username);
  const passwordHash = await hashPassword(password);

  try {
    const result = await query<UserRow>(
      `
        insert into app_users (username, display_name, password_hash)
        values ($1, $2, $3)
        returning id, username, display_name, created_at
      `,
      [normalizedUsername, displayName.trim(), passwordHash],
    );

    const [row] = result.rows;
    const sessionToken = await insertSession(row.id);

    return {
      sessionToken,
      user: serializeUser(row),
    };
  } catch (error) {
    const typedError = error as Error & { code?: string };

    if (typedError.code === "23505") {
      throw createHttpError("That username is already taken.", 409);
    }

    throw error;
  }
}

export async function loginAccount(credentials: unknown): Promise<{
  sessionToken: string;
  user: User;
}> {
  const { username, password } = parseOrThrow(
    loginCredentialsSchema,
    credentials,
    "The login payload is invalid.",
  );
  const normalizedUsername = normalizeUsername(username ?? "");
  const result = await query<PasswordUserRow>(
    `
      select id, username, display_name, created_at, password_hash
      from app_users
      where username = $1
    `,
    [normalizedUsername],
  );

  if ((result.rowCount ?? 0) === 0) {
    throw createHttpError("Incorrect username or password.", 401);
  }

  const [row] = result.rows;
  const isValid = await verifyPassword(password ?? "", row.password_hash);

  if (!isValid) {
    throw createHttpError("Incorrect username or password.", 401);
  }

  const sessionToken = await insertSession(row.id);

  return {
    sessionToken,
    user: serializeUser(row),
  };
}

export async function logoutSession(sessionId: string | null): Promise<void> {
  if (!sessionId) {
    return;
  }

  await query(
    `
      delete from user_sessions
      where id = $1
    `,
    [sessionId],
  );
}
