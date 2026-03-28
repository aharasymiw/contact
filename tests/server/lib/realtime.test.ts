import { describe, expect, it, vi } from "vitest";

function createMockResponse() {
  return {
    write: vi.fn(),
  };
}

async function loadRealtimeModule() {
  vi.resetModules();
  return import("../../../server/lib/realtime.ts");
}

describe("realtime", () => {
  it("sendSse_ValidPayload_WritesEventAndJsonDataLines", async () => {
    // Arrange
    const eventName = "presence-update";
    const payload = { onlineUserIds: ["user-1"] };
    const response = createMockResponse();
    const { sendSse } = await loadRealtimeModule();

    // Act
    sendSse(response, eventName, payload);

    // Assert
    expect(response.write.mock.calls).toEqual([
      [`event: ${eventName}\n`],
      [`data: ${JSON.stringify(payload)}\n\n`],
    ]);
  });

  it("addRealtimeConnection_NewUserAdded_ListOnlineUserIdsIncludesUser", async () => {
    // Arrange
    const userId = "user-1";
    const response = createMockResponse();
    const { addRealtimeConnection, listOnlineUserIds } = await loadRealtimeModule();

    // Act
    addRealtimeConnection(userId, response);
    const result = listOnlineUserIds();

    // Assert
    expect(result).toEqual([userId]);
  });

  it("removeRealtimeConnection_LastConnectionRemoved_RemovesUserFromOnlineList", async () => {
    // Arrange
    const userId = "user-1";
    const response = createMockResponse();
    const { addRealtimeConnection, listOnlineUserIds, removeRealtimeConnection } =
      await loadRealtimeModule();

    addRealtimeConnection(userId, response);

    // Act
    removeRealtimeConnection(userId, response);
    const result = listOnlineUserIds();

    // Assert
    expect(result).toEqual([]);
  });

  it("sendToUser_UserHasMultipleConnections_WritesEventToEachConnection", async () => {
    // Arrange
    const userId = "user-1";
    const eventName = "call-signal";
    const payload = { kind: "offer" };
    const firstResponse = createMockResponse();
    const secondResponse = createMockResponse();
    const { addRealtimeConnection, sendToUser } = await loadRealtimeModule();

    addRealtimeConnection(userId, firstResponse);
    addRealtimeConnection(userId, secondResponse);

    const expectedWritesPerConnection = [
      [`event: ${eventName}\n`],
      [`data: ${JSON.stringify(payload)}\n\n`],
    ];

    // Act
    sendToUser(userId, eventName, payload);

    // Assert
    expect(firstResponse.write.mock.calls).toEqual(expectedWritesPerConnection);
    expect(secondResponse.write.mock.calls).toEqual(expectedWritesPerConnection);
  });

  it("broadcast_MultipleUsersConnected_WritesEventToAllConnections", async () => {
    // Arrange
    const firstUserId = "user-1";
    const secondUserId = "user-2";
    const eventName = "presence-update";
    const payload = { onlineUserIds: [firstUserId, secondUserId] };
    const firstResponse = createMockResponse();
    const secondResponse = createMockResponse();
    const { addRealtimeConnection, broadcast } = await loadRealtimeModule();

    addRealtimeConnection(firstUserId, firstResponse);
    addRealtimeConnection(secondUserId, secondResponse);

    const expectedWritesPerConnection = [
      [`event: ${eventName}\n`],
      [`data: ${JSON.stringify(payload)}\n\n`],
    ];

    // Act
    broadcast(eventName, payload);

    // Assert
    expect(firstResponse.write.mock.calls).toEqual(expectedWritesPerConnection);
    expect(secondResponse.write.mock.calls).toEqual(expectedWritesPerConnection);
  });
});
