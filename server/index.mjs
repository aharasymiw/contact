import fs from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { createServer as createViteServer } from "vite";

import {
  attachCurrentUser,
  clearSessionCookie,
  loginAccount,
  logoutSession,
  registerAccount,
  requireUser,
  serializeUser,
  setSessionCookie,
} from "./lib/auth.mjs";
import { closePool, query } from "./lib/db.mjs";
import { config } from "./lib/config.mjs";
import {
  addRealtimeConnection,
  broadcast,
  listOnlineUserIds,
  removeRealtimeConnection,
  sendSse,
  sendToUser,
} from "./lib/realtime.mjs";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const projectDirectory = path.resolve(currentDirectory, "..");
const clientRoot = path.resolve(projectDirectory, "client");
const distRoot = path.resolve(projectDirectory, "dist/client");

const app = express();
const httpServer = createHttpServer(app);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

// Express 5 allows async middleware naturally, which keeps the authentication
// pipeline readable without bolting on another wrapper package.
app.use(attachCurrentUser);

function serializeCall(row, currentUserId) {
  const direction = row.caller_user_id === currentUserId ? "outgoing" : "incoming";
  const peerUserId = row.caller_user_id === currentUserId ? row.callee_user_id : row.caller_user_id;

  return {
    id: row.id,
    status: row.status,
    direction,
    peerUserId,
    callerUserId: row.caller_user_id,
    calleeUserId: row.callee_user_id,
    createdAt: row.created_at,
    answeredAt: row.answered_at,
    endedAt: row.ended_at,
  };
}

async function logCallEvent(callSessionId, actorUserId, eventType, eventPayload = {}) {
  await query(
    `
      insert into call_events (call_session_id, actor_user_id, event_type, event_payload)
      values ($1, $2, $3, $4::jsonb)
    `,
    [callSessionId, actorUserId, eventType, JSON.stringify(eventPayload)],
  );
}

async function loadPeerUsers(currentUserId) {
  const result = await query(
    `
      select id, username, display_name, created_at
      from app_users
      where id <> $1
      order by username asc
    `,
    [currentUserId],
  );

  const onlineSet = new Set(listOnlineUserIds());

  return result.rows.map((row) => ({
    ...serializeUser(row),
    online: onlineSet.has(row.id),
  }));
}

async function loadPendingInvites(currentUserId) {
  const result = await query(
    `
      select
        call_sessions.id,
        call_sessions.status,
        call_sessions.created_at,
        call_sessions.answered_at,
        call_sessions.ended_at,
        call_sessions.caller_user_id,
        call_sessions.callee_user_id,
        app_users.id as caller_id,
        app_users.username as caller_username,
        app_users.display_name as caller_display_name,
        app_users.created_at as caller_created_at
      from call_sessions
      join app_users on app_users.id = call_sessions.caller_user_id
      where call_sessions.callee_user_id = $1
        and call_sessions.status = 'ringing'
      order by call_sessions.created_at desc
    `,
    [currentUserId],
  );

  return result.rows.map((row) => ({
    call: serializeCall(row, currentUserId),
    fromUser: {
      id: row.caller_id,
      username: row.caller_username,
      displayName: row.caller_display_name,
      createdAt: row.caller_created_at,
    },
  }));
}

async function createBootstrapPayload(currentUser) {
  if (!currentUser) {
    return {
      authenticated: false,
      iceServers: config.iceServers,
    };
  }

  return {
    authenticated: true,
    currentUser,
    iceServers: config.iceServers,
    users: await loadPeerUsers(currentUser.id),
    pendingInvites: await loadPendingInvites(currentUser.id),
  };
}

async function loadCallForParticipant(callId, participantUserId) {
  const result = await query(
    `
      select *
      from call_sessions
      where id = $1
        and ($2 = caller_user_id or $2 = callee_user_id)
    `,
    [callId, participantUserId],
  );

  return result.rows[0] ?? null;
}

function otherParticipantId(callRow, currentUserId) {
  return callRow.caller_user_id === currentUserId ? callRow.callee_user_id : callRow.caller_user_id;
}

function escapeIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

app.get("/api/health", async (request, response) => {
  try {
    const result = await query("select now() as server_time");

    response.json({
      ok: true,
      serverTime: result.rows[0].server_time,
      postgresDatabase: config.database.database,
      nodeEnvironment: config.environment,
    });
  } catch (error) {
    response.status(500).json({
      ok: false,
      error: "The API is running, but PostgreSQL is not reachable yet.",
      detail: error.message,
    });
  }
});

app.get("/api/bootstrap", async (request, response, next) => {
  try {
    response.json(await createBootstrapPayload(request.currentUser));
  } catch (error) {
    next(error);
  }
});

app.post("/api/register", async (request, response, next) => {
  try {
    const registration = await registerAccount(request.body);
    setSessionCookie(response, registration.sessionToken);

    response.status(201).json({
      authenticated: true,
      currentUser: registration.user,
      iceServers: config.iceServers,
      users: await loadPeerUsers(registration.user.id),
      pendingInvites: [],
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/login", async (request, response, next) => {
  try {
    const login = await loginAccount(request.body);
    setSessionCookie(response, login.sessionToken);

    response.json({
      authenticated: true,
      currentUser: login.user,
      iceServers: config.iceServers,
      users: await loadPeerUsers(login.user.id),
      pendingInvites: await loadPendingInvites(login.user.id),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/logout", async (request, response, next) => {
  try {
    await logoutSession(request.sessionId);
    clearSessionCookie(response);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/users", requireUser, async (request, response, next) => {
  try {
    response.json({
      users: await loadPeerUsers(request.currentUser.id),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/events", requireUser, async (request, response, next) => {
  try {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    addRealtimeConnection(request.currentUser.id, response);

    sendSse(response, "connected", {
      message:
        "The browser now has a one-way Server-Sent Events stream for presence and signaling updates.",
      onlineUserIds: listOnlineUserIds(),
      pendingInvites: await loadPendingInvites(request.currentUser.id),
    });

    broadcast("presence-update", {
      onlineUserIds: listOnlineUserIds(),
    });

    const heartbeat = setInterval(() => {
      sendSse(response, "heartbeat", {
        at: new Date().toISOString(),
      });
    }, config.sseHeartbeatMs);

    request.on("close", () => {
      clearInterval(heartbeat);
      removeRealtimeConnection(request.currentUser.id, response);
      broadcast("presence-update", {
        onlineUserIds: listOnlineUserIds(),
      });
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/calls/invite", requireUser, async (request, response, next) => {
  try {
    const { calleeUserId } = request.body;

    if (!calleeUserId) {
      response.status(400).json({ error: "A calleeUserId is required." });
      return;
    }

    if (calleeUserId === request.currentUser.id) {
      response.status(400).json({ error: "You cannot call your own account." });
      return;
    }

    const calleeResult = await query(
      `
        select id, username, display_name, created_at
        from app_users
        where id = $1
      `,
      [calleeUserId],
    );

    if (calleeResult.rowCount === 0) {
      response.status(404).json({ error: "That user no longer exists." });
      return;
    }

    const result = await query(
      `
        insert into call_sessions (caller_user_id, callee_user_id, status)
        values ($1, $2, 'ringing')
        returning *
      `,
      [request.currentUser.id, calleeUserId],
    );

    const [callRow] = result.rows;
    const callee = serializeUser(calleeResult.rows[0]);

    await logCallEvent(callRow.id, request.currentUser.id, "invite-created", {
      calleeUserId,
    });

    sendToUser(calleeUserId, "call-invite", {
      call: serializeCall(callRow, calleeUserId),
      fromUser: request.currentUser,
    });

    response.status(201).json({
      call: serializeCall(callRow, request.currentUser.id),
      toUser: callee,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/calls/:callId/respond", requireUser, async (request, response, next) => {
  try {
    const { callId } = request.params;
    const { accept } = request.body;
    const callRow = await loadCallForParticipant(callId, request.currentUser.id);

    if (!callRow) {
      response.status(404).json({ error: "That call invitation does not exist." });
      return;
    }

    if (callRow.callee_user_id !== request.currentUser.id) {
      response.status(403).json({ error: "Only the invited user can answer this ringing call." });
      return;
    }

    if (callRow.status !== "ringing") {
      response.status(409).json({ error: "That call is no longer ringing." });
      return;
    }

    const nextStatus = accept ? "accepted" : "rejected";
    const result = await query(
      `
        update call_sessions
        set
          status = $2,
          answered_at = case when $2 = 'accepted' then now() else answered_at end,
          ended_at = case when $2 = 'rejected' then now() else ended_at end
        where id = $1
        returning *
      `,
      [callId, nextStatus],
    );

    const [updatedCall] = result.rows;

    await logCallEvent(callId, request.currentUser.id, "invite-responded", {
      accepted: Boolean(accept),
    });

    sendToUser(updatedCall.caller_user_id, "call-response", {
      accepted: Boolean(accept),
      call: serializeCall(updatedCall, updatedCall.caller_user_id),
      fromUser: request.currentUser,
    });

    response.json({
      accepted: Boolean(accept),
      call: serializeCall(updatedCall, request.currentUser.id),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/calls/:callId/signal", requireUser, async (request, response, next) => {
  try {
    const { callId } = request.params;
    const { kind, payload } = request.body;
    const allowedKinds = new Set(["offer", "answer", "ice-candidate"]);

    if (!allowedKinds.has(kind)) {
      response.status(400).json({
        error: "Signals must be offer, answer, or ice-candidate.",
      });
      return;
    }

    const callRow = await loadCallForParticipant(callId, request.currentUser.id);

    if (!callRow) {
      response.status(404).json({ error: "That call does not exist." });
      return;
    }

    if (callRow.status !== "accepted") {
      response.status(409).json({
        error: "Signaling can only happen after the callee accepts the invitation.",
      });
      return;
    }

    await logCallEvent(callId, request.currentUser.id, `signal:${kind}`, {
      kind,
      payload,
    });

    sendToUser(otherParticipantId(callRow, request.currentUser.id), "call-signal", {
      callId,
      kind,
      payload,
      fromUser: request.currentUser,
    });

    response.status(202).json({
      ok: true,
      relayedToUserId: otherParticipantId(callRow, request.currentUser.id),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/calls/:callId/end", requireUser, async (request, response, next) => {
  try {
    const { callId } = request.params;
    const callRow = await loadCallForParticipant(callId, request.currentUser.id);

    if (!callRow) {
      response.status(404).json({ error: "That call does not exist." });
      return;
    }

    const result = await query(
      `
        update call_sessions
        set status = 'ended', ended_at = now()
        where id = $1
        returning *
      `,
      [callId],
    );

    const [updatedCall] = result.rows;

    await logCallEvent(callId, request.currentUser.id, "call-ended", {});

    sendToUser(otherParticipantId(updatedCall, request.currentUser.id), "call-ended", {
      call: serializeCall(updatedCall, otherParticipantId(updatedCall, request.currentUser.id)),
      fromUser: request.currentUser,
    });

    response.json({
      call: serializeCall(updatedCall, request.currentUser.id),
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (request, response) => {
  response.status(404).json({
    error: `No API route exists for ${request.method} ${request.path}.`,
  });
});

let viteServer;

if (!config.isProduction) {
  viteServer = await createViteServer({
    root: clientRoot,
    configFile: path.resolve(projectDirectory, "vite.config.mjs"),
    server: {
      middlewareMode: true,
      hmr: {
        server: httpServer,
      },
    },
    appType: "custom",
  });

  app.use(viteServer.middlewares);
} else {
  app.use(express.static(distRoot));
}

app.use(async (request, response, next) => {
  try {
    if (request.path.startsWith("/api")) {
      next();
      return;
    }

    if (config.isProduction) {
      response.sendFile(path.resolve(distRoot, "index.html"));
      return;
    }

    const templatePath = path.resolve(clientRoot, "index.html");
    const rawTemplate = await fs.readFile(templatePath, "utf8");
    const transformedTemplate = await viteServer.transformIndexHtml(
      request.originalUrl,
      rawTemplate,
    );

    response.status(200).setHeader("Content-Type", "text/html");
    response.end(transformedTemplate);
  } catch (error) {
    next(error);
  }
});

app.use((error, request, response, _next) => {
  if (viteServer) {
    viteServer.ssrFixStacktrace(error);
  }

  const statusCode = error.statusCode ?? 500;

  response.status(statusCode).json({
    error: error.message ?? "Unexpected server error.",
    requestPath: request.path,
  });
});

const server = httpServer.listen(config.port, config.host, () => {
  const runtimeSummary = [
    `Express 5 API listening on http://${config.host}:${config.port}`,
    config.isProduction
      ? "Serving the production client bundle from dist/client"
      : "Running Vite in middleware mode so one Node process serves both API and client",
    `Target database: ${escapeIdentifier(config.database.database)}`,
  ];

  console.log(runtimeSummary.join("\n"));
});

async function shutdown() {
  server.close();
  await closePool();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
