/**
 * Purpose: Verifies artifact previews are redacted and truncated before they are emitted into public-safe outputs.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Uses synthetic text with home paths and email addresses to exercise deterministic redaction.
 */
import { describe, expect, it } from "vitest";

import {
  createMessagePreviews,
  sanitizeMessageText,
} from "../src/sanitization.js";

describe("sanitizeMessageText", () => {
  it("redacts home paths and email addresses", () => {
    const sanitized = sanitizeMessageText(
      "See /Users/example/project and email me at dev@example.com for details.",
      {
        homeDirectory: "/Users/example",
        maxLength: 200,
      },
    );

    expect(sanitized).toContain("~/project");
    expect(sanitized).toContain("[redacted-email]");
    expect(sanitized).not.toContain("/Users/example");
    expect(sanitized).not.toContain("dev@example.com");
  });

  it("truncates long previews deterministically", () => {
    const sanitized = sanitizeMessageText("a".repeat(40), {
      maxLength: 12,
    });

    expect(sanitized).toBe("aaaaaaaaa...");
  });
});

describe("createMessagePreviews", () => {
  it("limits preview count", () => {
    const previews = createMessagePreviews(["one", "two", "three"], {
      maxItems: 2,
      maxLength: 50,
    });

    expect(previews).toEqual(["one", "two"]);
  });
});
