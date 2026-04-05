/**
 * Purpose: Exercise the real evaluator pipeline against synthetic Codex, Claude, and pi transcript homes.
 * Responsibilities: Verify end-to-end discovery, parsing, normalization, v3 summary generation, and session-facts emission without mocks.
 * Scope: High-signal integration coverage for the source-aware evaluator boundary.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Fixtures stay synthetic and local-only while covering the real supported transcript shapes.
 */
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetConfig } from "../src/config/index.js";
import { evaluateArtifacts, parseArtifacts } from "../src/evaluator.js";
import {
  createClaudeHome,
  createCodexHome,
  createCodexHomeFromSessions,
  createCodexSessionContent,
  createPiHome,
} from "./support/transcript-fixtures.js";

const testDirBase = join(tmpdir(), "agent-eval-evaluator-integration");

describe("evaluateArtifacts integration", () => {
  beforeEach(async () => {
    resetConfig();
    await mkdir(testDirBase, { recursive: true });
  });

  afterEach(async () => {
    resetConfig();
    await rm(testDirBase, { recursive: true, force: true });
  });

  it("evaluates a real Codex transcript home through the full pipeline", async () => {
    const homeDir = await createCodexHome(testDirBase, "codex-home");

    const result = await evaluateArtifacts({
      source: "codex",
      home: homeDir,
    });

    expect(result.metrics.sessionCount).toBe(1);
    expect(result.rawTurns).toHaveLength(1);
    expect(result.sessionFacts).toHaveLength(1);
    expect(result.summary.overview.title).toBe("Transcript Analytics Report");
    expect(result.report).toContain("## Overview Dashboard");
    expect(result.presentation.reportHtml).toContain("Needs Review");
  });

  it("evaluates a real Claude transcript home through the shared summary pipeline", async () => {
    const homeDir = await createClaudeHome(testDirBase, "claude-home");

    const result = await evaluateArtifacts({
      source: "claude",
      home: homeDir,
      outputMode: "summary",
    });

    expect(result.metrics.sessionCount).toBe(1);
    expect(result.rawTurns).toBeUndefined();
    expect(result.incidents).toBeUndefined();
    expect(result.sessionFacts).toHaveLength(1);
    expect(result.summary.usageDashboard.headlineMetrics.sessions).toBe(1);
    expect(result.report).toContain("## Needs Review");
  });

  it("evaluates a real pi transcript home through the shared summary pipeline", async () => {
    const homeDir = await createPiHome(testDirBase, "pi-home");

    const result = await evaluateArtifacts({
      source: "pi",
      home: homeDir,
      outputMode: "summary",
    });

    expect(result.metrics.sessionCount).toBe(1);
    expect(result.sessionFacts).toHaveLength(1);
    expect(result.summary.overview.corpusContext).toContain("pi corpus");
    expect(result.presentation.reportHtml).toContain("Overview Dashboard");
  });

  it("keeps forked codex transcripts distinct when a child file includes parent session_meta", async () => {
    const homeDir = await createCodexHomeFromSessions(
      testDirBase,
      "codex-forked-session-meta",
      [
        {
          filename: "rollout-2026-03-06T19-00-00-parent-session.jsonl",
          content: createCodexSessionContent("parent-session"),
        },
        {
          filename: "rollout-2026-03-06T19-05-00-child-session.jsonl",
          content: `${[
            JSON.stringify({
              timestamp: "2026-03-06T19:05:00.000Z",
              type: "session_meta",
              payload: {
                id: "child-session",
                timestamp: "2026-03-06T19:05:00.000Z",
                cwd: "/workspace/demo",
                source: {
                  subagent: {
                    thread_spawn: {
                      parent_thread_id: "parent-session",
                    },
                  },
                },
              },
            }),
            JSON.stringify({
              timestamp: "2026-03-06T19:05:01.000Z",
              type: "session_meta",
              payload: {
                id: "parent-session",
                timestamp: "2026-03-06T19:00:00.000Z",
                cwd: "/workspace/demo",
              },
            }),
            JSON.stringify({
              timestamp: "2026-03-06T19:05:02.000Z",
              type: "turn_context",
              payload: {
                turn_id: "turn-1",
                cwd: "/workspace/demo",
              },
            }),
            JSON.stringify({
              timestamp: "2026-03-06T19:05:03.000Z",
              type: "response_item",
              payload: {
                type: "message",
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: "Please inspect the child transcript only.",
                  },
                ],
              },
            }),
          ].join("\n")}\n`,
        },
      ],
    );

    const result = await evaluateArtifacts({
      source: "codex",
      home: homeDir,
      outputMode: "summary",
    });

    expect(result.metrics.sessions).toHaveLength(2);
    expect(result.metrics.sessions.map((session) => session.sessionId)).toEqual(
      ["parent-session", "child-session"],
    );
    expect(result.sessionFacts.map((session) => session.sessionId)).toEqual([
      "parent-session",
      "child-session",
    ]);
  });

  it("rejects duplicate logical sessions before artifact generation", async () => {
    const homeDir = await createCodexHomeFromSessions(
      testDirBase,
      "codex-duplicate-session-id",
      [
        {
          filename: "duplicate-a.jsonl",
          content: createCodexSessionContent("shared-session"),
        },
        {
          filename: "duplicate-b.jsonl",
          content: createCodexSessionContent("shared-session"),
        },
      ],
    );

    await expect(
      evaluateArtifacts({
        source: "codex",
        home: homeDir,
        outputMode: "summary",
      }),
    ).rejects.toThrow(/Duplicate sessionId shared-session detected/i);
  });

  it("parses a real transcript home without emitting evaluation artifacts", async () => {
    const homeDir = await createCodexHome(testDirBase, "codex-parse");

    const result = await parseArtifacts({
      source: "codex",
      home: homeDir,
    });

    expect(result.sessionCount).toBe(1);
    expect(result.rawTurns).toHaveLength(1);
    expect(result.rawTurns[0]?.sessionId).toBe("codex-session-1");
  });

  it("evaluates a valid empty Codex home into a deterministic no-data full bundle", async () => {
    const homeDir = join(testDirBase, "codex-empty-report");
    await mkdir(join(homeDir, "sessions"), { recursive: true });

    const result = await evaluateArtifacts({
      source: "codex",
      home: homeDir,
    });

    expect(result.metrics.sessionCount).toBe(0);
    expect(result.summary.usageDashboard.headlineMetrics.sessions).toBe(0);
    expect(result.sessionFacts).toEqual([]);
    expect(result.rawTurns).toEqual([]);
    expect(result.incidents).toEqual([]);
    expect(result.report).toContain("## No Data Yet");
    expect(result.presentation.reportHtml).toContain("No Data Yet");
  });

  it("normalizes equivalent Codex, Claude, and pi workflows to the same session count", async () => {
    const codexHome = await createCodexHome(testDirBase, "codex-compare");
    const claudeHome = await createClaudeHome(testDirBase, "claude-compare");
    const piHome = await createPiHome(testDirBase, "pi-compare");

    const [codexResult, claudeResult, piResult] = await Promise.all([
      evaluateArtifacts({ source: "codex", home: codexHome }),
      evaluateArtifacts({ source: "claude", home: claudeHome }),
      evaluateArtifacts({ source: "pi", home: piHome }),
    ]);

    expect(codexResult.summary.usageDashboard.headlineMetrics.sessions).toBe(1);
    expect(claudeResult.summary.usageDashboard.headlineMetrics.sessions).toBe(
      1,
    );
    expect(piResult.summary.usageDashboard.headlineMetrics.sessions).toBe(1);
  });
});
