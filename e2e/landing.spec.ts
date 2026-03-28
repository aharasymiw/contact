import { expect, test } from "@playwright/test";

import { gotoHome } from "./helpers/app.ts";
import { resetTestDatabase } from "./helpers/database.ts";

test.beforeEach(async () => {
  await resetTestDatabase();
});

test("LandingPage_AnonymousVisitor_RendersEducationalSections", async ({ page }) => {
  // Arrange
  await gotoHome(page);

  // Act
  const protocolHeading = page.getByRole("heading", {
    name: "What the browser and server are each responsible for",
  });
  const guideHeading = page.getByRole("heading", {
    name: "How to build WebRTC in React + Node without WebRTC helper packages",
  });
  const liveLabHeading = page.getByRole("heading", {
    name: "Pick devices, call another user, and watch the protocol timeline",
  });

  // Assert
  await expect(protocolHeading).toBeVisible();
  await expect(guideHeading).toBeVisible();
  await expect(liveLabHeading).toBeVisible();
  await expect(page.getByText("Sign in to unlock the peer directory.")).toBeVisible();
  await expect(page.locator(".timeline-entry").first()).toContainText(
    "Ready to trace a WebRTC handshake",
  );
});
