import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "../../../server/lib/security.mjs";

describe("security", () => {
  it("createSessionToken_DefaultCall_ReturnsBase64UrlToken", () => {
    // Arrange
    const expectedTokenLength = 43;
    const expectedTokenPattern = /^[A-Za-z0-9_-]+$/;

    // Act
    const result = createSessionToken();

    // Assert
    expect(result).toHaveLength(expectedTokenLength);
    expect(result).toMatch(expectedTokenPattern);
  });

  it("hashSessionToken_KnownTokenProvided_ReturnsDeterministicSha256Digest", () => {
    // Arrange
    const rawToken = "signal-token";
    const expectedDigest = createHash("sha256").update(rawToken).digest("hex");

    // Act
    const result = hashSessionToken(rawToken);

    // Assert
    expect(result).toBe(expectedDigest);
  });

  it("hashPassword_ValidPassword_ReturnsScryptEnvelope", async () => {
    // Arrange
    const password = "contact-demo-123";
    const expectedScheme = "scrypt";
    const expectedSaltLength = 32;
    const expectedDigestLength = 128;

    // Act
    const result = await hashPassword(password);
    const [scheme, salt, digest] = result.split("$");

    // Assert
    expect(scheme).toBe(expectedScheme);
    expect(salt).toHaveLength(expectedSaltLength);
    expect(digest).toHaveLength(expectedDigestLength);
  });

  it("verifyPassword_MatchingPassword_ReturnsTrue", async () => {
    // Arrange
    const password = "contact-demo-123";
    const storedHash = await hashPassword(password);
    const expectedVerificationResult = true;

    // Act
    const result = await verifyPassword(password, storedHash);

    // Assert
    expect(result).toBe(expectedVerificationResult);
  });

  it("verifyPassword_InvalidScheme_ReturnsFalse", async () => {
    // Arrange
    const password = "contact-demo-123";
    const invalidHash = "argon2$abc$def";
    const expectedVerificationResult = false;

    // Act
    const result = await verifyPassword(password, invalidHash);

    // Assert
    expect(result).toBe(expectedVerificationResult);
  });

  it("verifyPassword_MismatchedPassword_ReturnsFalse", async () => {
    // Arrange
    const originalPassword = "contact-demo-123";
    const mismatchedPassword = "contact-demo-999";
    const storedHash = await hashPassword(originalPassword);
    const expectedVerificationResult = false;

    // Act
    const result = await verifyPassword(mismatchedPassword, storedHash);

    // Assert
    expect(result).toBe(expectedVerificationResult);
  });
});
