/**
 * Purpose: Exercise the real evaluator pipeline against synthetic Codex and Claude transcript homes.
 * Responsibilities: Verify end-to-end discovery, parsing, normalization, summary generation, and cancellation without mocks.
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
    expect(result.metrics.inventory[0]?.provider).toBe("codex");
    expect(result.rawTurns).toHaveLength(1);
    expect(result.rawTurns?.[0]?.sessionId).toBe("codex-session-1");
    expect(result.rawTurns?.[0]?.sourceRefs[0]?.provider).toBe("codex");
    expect(result.report).toContain("# Agent Evaluator Report");
    expect(result.presentation.reportHtml).toContain("Agent Evaluator Report");
  });

  it("evaluates a real Claude transcript home through the shared summary pipeline", async () => {
    const homeDir = await createClaudeHome(testDirBase, "claude-home");

    const result = await evaluateArtifacts({
      source: "claude",
      home: homeDir,
      outputMode: "summary",
    });

    expect(result.metrics.sessionCount).toBe(1);
    expect(result.metrics.inventory[0]?.provider).toBe("claude");
    expect(result.summary.sessions).toBe(1);
    expect(result.summary.turns).toBeGreaterThan(0);
    expect(result.rawTurns).toBeUndefined();
    expect(result.incidents).toBeUndefined();
    expect(result.report).toContain("Sources: `claude`");
    expect(result.presentation.reportHtml).toContain("Agent Evaluator Report");
  });

  it("parses a real transcript home without emitting evaluation artifacts", async () => {
    const homeDir = await createCodexHome(testDirBase, "codex-parse");

    const result = await parseArtifacts({
      source: "codex",
      home: homeDir,
    });

    expect(result.sessionCount).toBe(1);
    expect(result.inventory[0]?.kind).toBe("session_jsonl");
    expect(result.rawTurns).toHaveLength(1);
    expect(result.rawTurns[0]?.sessionId).toBe("codex-session-1");
  });

  it("normalizes equivalent Codex and Claude workflows to the same turn count", async () => {
    const codexHome = await createCodexHome(testDirBase, "codex-compare");
    const claudeHome = await createClaudeHome(testDirBase, "claude-compare");

    const [codexResult, claudeResult] = await Promise.all([
      evaluateArtifacts({
        source: "codex",
        home: codexHome,
      }),
      evaluateArtifacts({
        source: "claude",
        home: claudeHome,
      }),
    ]);

    expect(codexResult.summary.sessions).toBe(1);
    expect(claudeResult.summary.sessions).toBe(1);
    expect(codexResult.summary.turns).toBe(1);
    expect(claudeResult.summary.turns).toBe(codexResult.summary.turns);
    expect(claudeResult.rawTurns).toHaveLength(
      codexResult.rawTurns?.length ?? 0,
    );
  });

  it("propagates abort signals through the Claude evaluation path", async () => {
    const homeDir = await createClaudeHome(testDirBase, "claude-abort");
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      evaluateArtifacts(
        {
          source: "claude",
          home: homeDir,
        },
        abortController.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("fails parseArtifacts when the canonical transcript directory is missing", async () => {
    await expect(
      parseArtifacts({
        source: "codex",
        home: join(testDirBase, "missing-home"),
      }),
    ).rejects.toMatchObject({ name: "MissingTranscriptInputError" });
  });

  it("fails parseArtifacts when no transcript JSONL files are present", async () => {
    const homeDir = join(testDirBase, "empty-home");
    await mkdir(join(homeDir, "sessions"), { recursive: true });

    await expect(
      parseArtifacts({
        source: "codex",
        home: homeDir,
      }),
    ).rejects.toMatchObject({ name: "MissingTranscriptInputError" });
  });
});
