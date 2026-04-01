/**
 * Purpose: Verify transcript session recency probing and timestamp fallback behavior.
 * Responsibilities: Ensure parsed timestamps outrank filesystem mtimes and invalid startedAt values fall back correctly.
 * Scope: Direct coverage for session-order probing logic outside evaluator mocks.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Probe ordering must remain deterministic across valid, invalid, and missing timestamps.
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { probeSessionOrder } from "../src/transcript/session-order.js";

const tempDirs: string[] = [];

describe("probeSessionOrder", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.map(async (dir) => {
        const { rm } = await import("node:fs/promises");
        await rm(dir, { recursive: true, force: true });
      }),
    );
    tempDirs.length = 0;
  });

  it("captures codex session startedAt and earliest timestamps", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-eval-session-order-"));
    tempDirs.push(dir);
    const path = join(dir, "session.jsonl");
    await writeFile(
      path,
      [
        JSON.stringify({
          timestamp: "2026-03-10T10:00:05.000Z",
          type: "session_meta",
          payload: { id: "s1", timestamp: "2026-03-10T10:00:00.000Z" },
        }),
        JSON.stringify({
          timestamp: "2026-03-10T10:00:01.000Z",
          type: "response_item",
          payload: { type: "message", role: "user", content: [] },
        }),
      ].join("\n"),
      "utf8",
    );

    const probe = await probeSessionOrder(path, "codex");
    expect(probe.startedAt).toBe("2026-03-10T10:00:00.000Z");
    expect(probe.earliestTimestamp).toBe("2026-03-10T10:00:01.000Z");
  });

  it("captures pi session header timestamps", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-eval-session-order-"));
    tempDirs.push(dir);
    const path = join(dir, "session.jsonl");
    await writeFile(
      path,
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: "pi-session-1",
          timestamp: "2026-03-10T09:00:00.000Z",
          cwd: "/workspace/demo",
        }),
        JSON.stringify({
          type: "message",
          id: "user-1",
          parentId: null,
          timestamp: "2026-03-10T09:00:01.000Z",
          message: { role: "user", content: [{ type: "text", text: "Hi" }] },
        }),
      ].join("\n"),
      "utf8",
    );

    const probe = await probeSessionOrder(path, "pi");
    expect(probe.startedAt).toBe("2026-03-10T09:00:00.000Z");
    expect(probe.earliestTimestamp).toBe("2026-03-10T09:00:00.000Z");
  });

  it("retains invalid startedAt while still capturing a valid earliest timestamp", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-eval-session-order-"));
    tempDirs.push(dir);
    const path = join(dir, "session.jsonl");
    await writeFile(
      path,
      [
        JSON.stringify({
          timestamp: "2026-03-10T11:00:01.000Z",
          type: "session_meta",
          payload: { id: "s1", timestamp: "not-a-date" },
        }),
        JSON.stringify({
          timestamp: "2026-03-10T11:00:02.000Z",
          type: "response_item",
          payload: { type: "message", role: "user", content: [] },
        }),
      ].join("\n"),
      "utf8",
    );

    const probe = await probeSessionOrder(path, "codex");
    expect(probe.startedAt).toBe("not-a-date");
    expect(probe.earliestTimestamp).toBe("2026-03-10T11:00:01.000Z");
  });
});
