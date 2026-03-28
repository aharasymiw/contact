type SsePayload = Record<string, unknown>;
type SseWritable = {
  write: (chunk: string) => void;
};

const connectionsByUserId = new Map<string, Set<SseWritable>>();

function getConnectionSet(userId: string): Set<SseWritable> {
  if (!connectionsByUserId.has(userId)) {
    connectionsByUserId.set(userId, new Set());
  }

  return connectionsByUserId.get(userId)!;
}

export function sendSse(response: SseWritable, eventName: string, payload: SsePayload): void {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function addRealtimeConnection(userId: string, response: SseWritable): void {
  getConnectionSet(userId).add(response);
}

export function removeRealtimeConnection(userId: string, response: SseWritable): void {
  const connections = connectionsByUserId.get(userId);

  if (!connections) {
    return;
  }

  connections.delete(response);

  if (connections.size === 0) {
    connectionsByUserId.delete(userId);
  }
}

export function listOnlineUserIds(): string[] {
  return [...connectionsByUserId.keys()];
}

export function sendToUser(userId: string, eventName: string, payload: SsePayload): void {
  const connections = connectionsByUserId.get(userId);

  if (!connections) {
    return;
  }

  for (const response of connections) {
    sendSse(response, eventName, payload);
  }
}

export function broadcast(eventName: string, payload: SsePayload): void {
  for (const userId of connectionsByUserId.keys()) {
    sendToUser(userId, eventName, payload);
  }
}
