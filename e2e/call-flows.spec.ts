import { expect, test } from "@playwright/test";

import {
  createRealtimeContext,
  createE2eUser,
  inviteCard,
  peerCard,
  refreshPeerDirectory,
  registerUser,
  timelineEntry,
} from "./helpers/app.ts";
import { resetTestDatabase } from "./helpers/database.ts";

test.beforeEach(async () => {
  await resetTestDatabase();
});

test("InviteDecline_TwoSignedInUsers_CleansUpPendingCallState", async ({ browser }) => {
  // Arrange
  const alice = createE2eUser("alice");
  const bob = createE2eUser("bob");
  const aliceContext = await createRealtimeContext(browser);
  const bobContext = await createRealtimeContext(browser);
  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();

  try {
    await registerUser(alicePage, alice);
    await registerUser(bobPage, bob);
    await refreshPeerDirectory(alicePage);
    await refreshPeerDirectory(bobPage);

    // Act
    await expect(peerCard(alicePage, bob.displayName)).toBeVisible();
    await expect(peerCard(bobPage, alice.displayName)).toBeVisible();
    await peerCard(alicePage, bob.displayName)
      .getByRole("button", { name: /Call user|Invite anyway/ })
      .click();
    await expect(inviteCard(bobPage, alice.displayName)).toBeVisible();
    await inviteCard(bobPage, alice.displayName).getByRole("button", { name: "Decline" }).click();

    // Assert
    await expect(timelineEntry(alicePage, "Invite declined by remote user")).toBeVisible();
    await expect(alicePage.locator(".stage-panel h3")).toHaveText("No active call");
    await expect(inviteCard(bobPage, alice.displayName)).toHaveCount(0);
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});

test("InviteAccept_TwoSignedInUsers_ExchangeSignalingAndEndCall", async ({ browser }) => {
  // Arrange
  const alice = createE2eUser("alice");
  const bob = createE2eUser("bob");
  const aliceContext = await createRealtimeContext(browser);
  const bobContext = await createRealtimeContext(browser);
  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();

  try {
    await registerUser(alicePage, alice);
    await registerUser(bobPage, bob);
    await refreshPeerDirectory(alicePage);
    await refreshPeerDirectory(bobPage);
    await expect(peerCard(alicePage, bob.displayName)).toBeVisible();

    // Act
    await peerCard(alicePage, bob.displayName)
      .getByRole("button", { name: /Call user|Invite anyway/ })
      .click();
    await expect(inviteCard(bobPage, alice.displayName)).toBeVisible();
    await inviteCard(bobPage, alice.displayName).getByRole("button", { name: "Accept" }).click();

    // Assert
    await expect(timelineEntry(alicePage, "Invite accepted by remote user")).toBeVisible({
      timeout: 20_000,
    });
    await expect(timelineEntry(alicePage, "Caller created an SDP offer")).toBeVisible({
      timeout: 20_000,
    });
    await expect(timelineEntry(bobPage, "Callee created an SDP answer")).toBeVisible({
      timeout: 20_000,
    });
    await expect(alicePage.locator(".stage-panel h3")).toContainText(/connecting|connected/i);
    await expect(bobPage.locator(".stage-panel h3")).toContainText(/connecting|connected/i);

    await alicePage.getByRole("button", { name: "End call" }).click();
    await expect(alicePage.locator(".stage-panel h3")).toHaveText("No active call", {
      timeout: 20_000,
    });
    await expect(bobPage.locator(".stage-panel h3")).toHaveText("No active call", {
      timeout: 20_000,
    });
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});
