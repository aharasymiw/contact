import { expect, test } from "@playwright/test";

import {
  createE2eUser,
  loginUser,
  logoutUser,
  registerUser,
  timelineEntry,
} from "./helpers/app.ts";
import { resetTestDatabase } from "./helpers/database.ts";

test.beforeEach(async () => {
  await resetTestDatabase();
});

test("RegisterAndLogin_FreshVisitor_AuthenticatesAcrossRealEndpoints", async ({ page }) => {
  // Arrange
  const alice = createE2eUser("alice");

  // Act
  await registerUser(page, alice);
  await logoutUser(page);
  await loginUser(page, alice);

  // Assert
  await expect(page.getByText(/SSE transport status:\s*connected/i)).toBeVisible();
  await expect(timelineEntry(page, "Session authenticated")).toBeVisible();
});
