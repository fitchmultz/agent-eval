/**
 * Purpose: Exercise the real evaluator pipeline against synthetic Codex, Claude, and pi transcript homes.
 * Responsibilities: Verify end-to-end discovery, parsing, normalization, and operator-summary generation without mocks.
 * Scope: High-signal integration coverage for the source-aware evaluator boundary.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Fixtures stay synthetic and local-only while covering the real supported transcript shapes.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetConfig } from "../src/config/index.js";
import { evaluateArtifacts, parseArtifacts } from "../src/evaluator.js";
import {
  createClaudeHome,
  createCodexHome,
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
    expect(result.metrics.inventory[0]?.provider).toBe("codex");
    expect(result.rawTurns).toHaveLength(1);
    expect(result.summary.executiveSummary?.problem).toBeDefined();
    expect(result.summary.topSessions).toEqual([]);
    expect(result.summary.executiveSummary?.action).toContain(
      "No ranked sessions were available",
    );
    expect(result.report).toContain("## Executive Summary");
    expect(result.presentation.reportHtml).toContain(
      "Sessions To Review First",
    );
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
    expect(result.report).toContain("Context: claude corpus");
    expect(result.report).toContain("## Sessions To Review First");
  });

  it("evaluates a real pi transcript home through the shared summary pipeline", async () => {
    const homeDir = await createPiHome(testDirBase, "pi-home");

    const result = await evaluateArtifacts({
      source: "pi",
      home: homeDir,
      outputMode: "summary",
    });

    expect(result.metrics.sessionCount).toBe(1);
    expect(result.metrics.inventory[0]?.provider).toBe("pi");
    expect(result.summary.sessions).toBe(1);
    expect(result.summary.turns).toBeGreaterThan(0);
    expect(result.rawTurns).toBeUndefined();
    expect(result.incidents).toBeUndefined();
    expect(result.report).toContain("Context: pi corpus");
    expect(result.summary.topSessions).toEqual([]);
  });

  it("keeps ranked summary sessions unique when multiple transcript files share a session ID", async () => {
    const homeDir = join(testDirBase, "codex-duplicate-session-id");
    const sessionsDir = join(homeDir, "sessions", "2026", "03");
    await mkdir(sessionsDir, { recursive: true });
    const signalfulContent = createCodexSessionContent(
      "shared-session",
    ).replace('"name":"exec_command"', '"name":"apply_patch"');
    await writeFile(
      join(sessionsDir, "duplicate-a.jsonl"),
      signalfulContent,
      "utf8",
    );
    await writeFile(
      join(sessionsDir, "duplicate-b.jsonl"),
      signalfulContent,
      "utf8",
    );

    const result = await evaluateArtifacts({
      source: "codex",
      home: homeDir,
      outputMode: "summary",
    });

    expect(result.metrics.sessions).toHaveLength(2);
    expect(
      result.summary.topSessions.map((session) => session.sessionId),
    ).toEqual(["shared-session"]);
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

  it("evaluates a valid empty Codex home into a deterministic no-data full bundle", async () => {
    const homeDir = join(testDirBase, "codex-empty-report");
    await mkdir(join(homeDir, "sessions"), { recursive: true });

    const result = await evaluateArtifacts({
      source: "codex",
      home: homeDir,
    });

    expect(result.metrics.sessionCount).toBe(0);
    expect(result.summary.sessions).toBe(0);
    expect(result.rawTurns).toEqual([]);
    expect(result.incidents).toEqual([]);
    expect(result.report).toContain("## No Data Yet");
    expect(result.report).toContain("Context: codex corpus");
    expect(result.presentation.reportHtml).toContain("No Data Yet");
    expect(result.presentation.reportHtml).toContain("missing canonical input");
    expect(result.presentation.reportHtml).not.toContain(
      "Sessions To Review First",
    );
  });

  it("evaluates a valid empty Codex home into a deterministic no-data summary bundle", async () => {
    const homeDir = join(testDirBase, "codex-empty-summary");
    await mkdir(join(homeDir, "sessions"), { recursive: true });

    const result = await evaluateArtifacts({
      source: "codex",
      home: homeDir,
      outputMode: "summary",
    });

    expect(result.metrics.sessionCount).toBe(0);
    expect(result.summary.sessions).toBe(0);
    expect(result.rawTurns).toBeUndefined();
    expect(result.incidents).toBeUndefined();
    expect(result.report).toContain("## No Data Yet");
    expect(result.presentation.reportHtml).toContain(
      "deterministic empty corpus",
    );
  });

  it("normalizes equivalent Codex, Claude, and pi workflows to the same turn count", async () => {
    const codexHome = await createCodexHome(testDirBase, "codex-compare");
    const claudeHome = await createClaudeHome(testDirBase, "claude-compare");
    const piHome = await createPiHome(testDirBase, "pi-compare");

    const [codexResult, claudeResult, piResult] = await Promise.all([
      evaluateArtifacts({
        source: "codex",
        home: codexHome,
      }),
      evaluateArtifacts({
        source: "claude",
        home: claudeHome,
      }),
      evaluateArtifacts({
        source: "pi",
        home: piHome,
      }),
    ]);

    expect(codexResult.summary.sessions).toBe(1);
    expect(claudeResult.summary.sessions).toBe(1);
    expect(piResult.summary.sessions).toBe(1);
    expect(codexResult.summary.turns).toBe(1);
    expect(claudeResult.summary.turns).toBe(codexResult.summary.turns);
    expect(piResult.summary.turns).toBe(codexResult.summary.turns);
  });
});
