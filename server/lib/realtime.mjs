const connectionsByUserId = new Map();

function getConnectionSet(userId) {
  if (!connectionsByUserId.has(userId)) {
    connectionsByUserId.set(userId, new Set());
  }

  return connectionsByUserId.get(userId);
}

export function sendSse(response, eventName, payload) {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function addRealtimeConnection(userId, response) {
  getConnectionSet(userId).add(response);
}

export function removeRealtimeConnection(userId, response) {
  const connections = connectionsByUserId.get(userId);

  if (!connections) {
    return;
  }

  connections.delete(response);

  if (connections.size === 0) {
    connectionsByUserId.delete(userId);
  }
}

export function listOnlineUserIds() {
  return [...connectionsByUserId.keys()];
}

export function sendToUser(userId, eventName, payload) {
  const connections = connectionsByUserId.get(userId);

  if (!connections) {
    return;
  }

  for (const response of connections) {
    sendSse(response, eventName, payload);
  }
}

export function broadcast(eventName, payload) {
  for (const userId of connectionsByUserId.keys()) {
    sendToUser(userId, eventName, payload);
  }
}
