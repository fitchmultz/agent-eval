/**
 * Purpose: Verifies the v3 summary contract is strict and rejects stale v2-only keys.
 * Responsibilities: Validate canonical summary payloads against the runtime schema.
 * Scope: Contract-level coverage for summary.json.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: The v3 summary contract is a hard cutover with no compatibility layer.
 */
import { describe, expect, it } from "vitest";

import { summaryArtifactSchema } from "../src/schema.js";
import { createV3Summary } from "./support/v3-fixtures.js";

describe("schema v3 contract", () => {
  it("accepts a minimal v3 summary payload", () => {
    expect(() => summaryArtifactSchema.parse(createV3Summary())).not.toThrow();
  });

  it("rejects extra stale v2 keys", () => {
    expect(() =>
      summaryArtifactSchema.parse({
        ...createV3Summary(),
        topSessions: [],
      }),
    ).toThrow();
  });
});
