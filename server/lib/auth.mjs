import { config } from "./config.mjs";
import { parseCookieHeader } from "./cookies.mjs";
import { query } from "./db.mjs";
import { createSessionToken, hashPassword, hashSessionToken, verifyPassword } from "./security.mjs";

function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

function validateCredentials({ username, displayName, password }) {
  const normalizedUsername = normalizeUsername(username ?? "");
  const trimmedDisplayName = (displayName ?? "").trim();

  if (!/^[a-z0-9_]{3,24}$/.test(normalizedUsername)) {
    return "Usernames must be 3-24 characters using lowercase letters, numbers, or underscores.";
  }

  if (!trimmedDisplayName || trimmedDisplayName.length > 48) {
    return "Display names must be between 1 and 48 characters.";
  }

  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return "Passwords must be between 8 and 128 characters.";
  }

  return null;
}

export function serializeUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

export function setSessionCookie(response, rawToken) {
  response.cookie(config.sessionCookieName, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    maxAge: config.sessionLifetimeMs,
    path: "/",
  });
}

export function clearSessionCookie(response) {
  response.clearCookie(config.sessionCookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
  });
}

async function insertSession(userId) {
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

export async function attachCurrentUser(request, response, next) {
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
    const result = await query(
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

    if (result.rowCount === 0) {
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

export function requireUser(request, response, next) {
  if (!request.currentUser) {
    response.status(401).json({
      error: "You need to log in before using the live call lab.",
    });
    return;
  }

  next();
}

export async function registerAccount({ username, displayName, password }) {
  const validationError = validateCredentials({ username, displayName, password });

  if (validationError) {
    const error = new Error(validationError);
    error.statusCode = 400;
    throw error;
  }

  const normalizedUsername = normalizeUsername(username);
  const passwordHash = await hashPassword(password);

  try {
    const result = await query(
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
    if (error.code === "23505") {
      const duplicateError = new Error("That username is already taken.");
      duplicateError.statusCode = 409;
      throw duplicateError;
    }

    throw error;
  }
}

export async function loginAccount({ username, password }) {
  const normalizedUsername = normalizeUsername(username ?? "");
  const result = await query(
    `
      select id, username, display_name, created_at, password_hash
      from app_users
      where username = $1
    `,
    [normalizedUsername],
  );

  if (result.rowCount === 0) {
    const error = new Error("Incorrect username or password.");
    error.statusCode = 401;
    throw error;
  }

  const [row] = result.rows;
  const isValid = await verifyPassword(password ?? "", row.password_hash);

  if (!isValid) {
    const error = new Error("Incorrect username or password.");
    error.statusCode = 401;
    throw error;
  }

  const sessionToken = await insertSession(row.id);

  return {
    sessionToken,
    user: serializeUser(row),
  };
}

export async function logoutSession(sessionId) {
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
