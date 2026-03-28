import { describe, expect, it } from "vitest";

import { parseCookieHeader } from "../../../server/lib/cookies.ts";

describe("parseCookieHeader", () => {
  it("parseCookieHeader_EncodedCookieValues_DecodesAndReturnsMap", () => {
    // Arrange
    const cookieHeader = "session_id=abc123; display_name=Alice%20Signal; theme=signal%2Fdark";
    const expectedCookies = {
      session_id: "abc123",
      display_name: "Alice Signal",
      theme: "signal/dark",
    };

    // Act
    const result = parseCookieHeader(cookieHeader);

    // Assert
    expect(result).toEqual(expectedCookies);
  });

  it("parseCookieHeader_MalformedChunkWithoutEquals_IgnoresChunk", () => {
    // Arrange
    const cookieHeader = "session_id=abc123; malformed_cookie; theme=dark";
    const expectedCookies = {
      session_id: "abc123",
      theme: "dark",
    };

    // Act
    const result = parseCookieHeader(cookieHeader);

    // Assert
    expect(result).toEqual(expectedCookies);
  });

  it("parseCookieHeader_EmptyHeader_ReturnsEmptyObject", () => {
    // Arrange
    const cookieHeader = "";
    const expectedCookies = {};

    // Act
    const result = parseCookieHeader(cookieHeader);

    // Assert
    expect(result).toEqual(expectedCookies);
  });
});
