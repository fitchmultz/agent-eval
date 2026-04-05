/**
 * Purpose: Guards the Phase 5 product contract against cross-provider, scaffold-heavy, and low-sample regressions.
 * Responsibilities: Exercise canonical evaluator outputs rather than isolated helpers.
 * Scope: Corpus-level regression coverage for the v3 product surface.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Tests stay synthetic, deterministic, and provider-neutral where possible.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeArtifacts } from "../src/artifact-writer.js";
import { resetConfig } from "../src/config/index.js";
import { evaluateArtifacts } from "../src/evaluator.js";
import {
  createClaudeHome,
  createClaudeSessionContent,
  createCodexHome,
  createCodexHomeFromSessions,
  createPiHome,
} from "./support/transcript-fixtures.js";

const testDirBase = join(tmpdir(), "agent-eval-corpus-regression");

function createScaffoldHeavyCodexContent(
  sessionId: string,
  task: string,
): string {
  const scaffold =
    "You are an autonomous coding agent. Do not stop early. Always run the relevant tests before ending your turn.";
  return `${[
    JSON.stringify({
      timestamp: "2026-03-10T10:00:00.000Z",
      type: "session_meta",
      payload: {
        id: sessionId,
        timestamp: "2026-03-10T10:00:00.000Z",
        cwd: "/workspace/demo",
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T10:00:01.000Z",
      type: "turn_context",
      payload: { turn_id: "turn-1", cwd: "/workspace/demo" },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T10:00:02.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: `${scaffold}\n\n${task}`,
          },
        ],
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T10:00:03.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "I will patch the file." }],
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T10:00:04.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        name: "apply_patch",
        arguments:
          "*** Begin Patch\n*** Update File: README.md\n+updated\n*** End Patch",
        call_id: `${sessionId}-call-1`,
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T10:00:05.000Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: `${sessionId}-call-1`,
        output: "Success",
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T10:00:06.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Patch applied." }],
      },
    }),
  ].join("\n")}
`;
}

describe("corpus regression", () => {
  beforeEach(async () => {
    resetConfig();
    await mkdir(testDirBase, { recursive: true });
  });

  afterEach(async () => {
    resetConfig();
    await rm(testDirBase, { recursive: true, force: true });
  });

  it("keeps the top-level product shape aligned across codex, claude, and pi", async () => {
    const codexHome = await createCodexHome(testDirBase, "codex-compare");
    const claudeHome = await createClaudeHome(testDirBase, "claude-compare");
    const piHome = await createPiHome(testDirBase, "pi-compare");

    const [codexResult, claudeResult, piResult] = await Promise.all([
      evaluateArtifacts({
        source: "codex",
        home: codexHome,
        outputMode: "summary",
      }),
      evaluateArtifacts({
        source: "claude",
        home: claudeHome,
        outputMode: "summary",
      }),
      evaluateArtifacts({ source: "pi", home: piHome, outputMode: "summary" }),
    ]);

    for (const result of [codexResult, claudeResult, piResult]) {
      expect(result.summary.overview.title).toBe("Transcript Analytics Report");
      expect(result.summary).toHaveProperty("usageDashboard");
      expect(result.summary).toHaveProperty("exemplarSessions");
      expect(result.summary).toHaveProperty("reviewQueue");
      expect(result.summary).toHaveProperty("learningPatterns");
      expect(result.sessionFacts.length).toBe(result.metrics.sessionCount);
      const exemplarIds = new Set(
        result.summary.exemplarSessions.map((session) => session.sessionId),
      );
      expect(
        result.summary.reviewQueue.some((session) =>
          exemplarIds.has(session.sessionId),
        ),
      ).toBe(false);
    }
  });

  it("discloses scaffold-heavy corpora without letting scaffold text dominate surfaced titles", async () => {
    const homeDir = await createCodexHomeFromSessions(
      testDirBase,
      "codex-scaffold-heavy",
      [
        {
          filename: "session-1.jsonl",
          content: createScaffoldHeavyCodexContent(
            "scaffold-1",
            "Fix the login redirect regression.",
          ),
        },
        {
          filename: "session-2.jsonl",
          content: createScaffoldHeavyCodexContent(
            "scaffold-2",
            "Repair the billing webhook handler.",
          ),
        },
        {
          filename: "session-3.jsonl",
          content: createScaffoldHeavyCodexContent(
            "scaffold-3",
            "Update the CLI release notes.",
          ),
        },
      ],
    );

    const result = await evaluateArtifacts({
      source: "codex",
      home: homeDir,
      outputMode: "summary",
    });

    expect(
      result.summary.templateSubstrate.affectedSessionCount,
    ).toBeGreaterThan(0);
    expect(result.summary.templateSubstrate.topFamilies.length).toBeGreaterThan(
      0,
    );
    const surfacedTitles = [
      ...result.summary.exemplarSessions.map((session) => session.title),
      ...result.summary.reviewQueue.map((session) => session.title),
    ];
    expect(
      surfacedTitles.some((title) =>
        title.includes("Fix the login redirect regression"),
      ),
    ).toBe(true);
    expect(
      surfacedTitles.some((title) => /autonomous coding agent/i.test(title)),
    ).toBe(false);
  });

  it("redacts pi provider-encoded source roots from public artifacts", async () => {
    const homeDir = await createPiHome(testDirBase, "pi-redaction", 1);
    const outputDir = join(testDirBase, "pi-redaction-artifacts");

    const result = await evaluateArtifacts({
      source: "pi",
      home: homeDir,
      outputMode: "summary",
    });
    await writeArtifacts(result, outputDir);

    const [summaryJson, sessionFacts, reportMd, reportHtml] = await Promise.all(
      [
        readFile(join(outputDir, "summary.json"), "utf8"),
        readFile(join(outputDir, "session-facts.jsonl"), "utf8"),
        readFile(join(outputDir, "report.md"), "utf8"),
        readFile(join(outputDir, "report.html"), "utf8"),
      ],
    );

    for (const artifact of [summaryJson, sessionFacts, reportMd, reportHtml]) {
      expect(artifact).not.toContain("/Users/");
      expect(artifact).not.toMatch(
        /(?:^|[^A-Za-z])Users-[A-Za-z0-9._-]+(?:-[A-Za-z0-9._-]+){1,}/,
      );
      expect(artifact).not.toContain("--Users-test-project--");
      expect(artifact).toContain("redacted-session-root");
    }
  });

  it("redacts claude temp-root source paths from public artifacts", async () => {
    const homeDir = join(testDirBase, "claude-redaction");
    const projectsDir = join(
      homeDir,
      "projects",
      "-private-var-folders-rf-t1b4c-cn7sgc-f6tkyg0wsk00000gn-T",
    );
    const outputDir = join(testDirBase, "claude-redaction-artifacts");
    await mkdir(projectsDir, { recursive: true });
    await writeFile(
      join(projectsDir, "session-1.jsonl"),
      createClaudeSessionContent("claude-redaction-session"),
      "utf8",
    );

    const result = await evaluateArtifacts({
      source: "claude",
      home: homeDir,
      outputMode: "summary",
    });
    await writeArtifacts(result, outputDir);

    const [summaryJson, sessionFacts, reportMd, reportHtml] = await Promise.all(
      [
        readFile(join(outputDir, "summary.json"), "utf8"),
        readFile(join(outputDir, "session-facts.jsonl"), "utf8"),
        readFile(join(outputDir, "report.md"), "utf8"),
        readFile(join(outputDir, "report.html"), "utf8"),
      ],
    );

    for (const artifact of [summaryJson, sessionFacts, reportMd, reportHtml]) {
      expect(artifact).not.toContain("/private/var/folders/");
      expect(artifact).not.toContain("-private-var-folders-");
      expect(artifact).toContain("redacted-session-root");
    }
  });

  it("propagates low-sample and low-write-session warnings through the product surface", async () => {
    const homeDir = await createCodexHomeFromSessions(
      testDirBase,
      "codex-low-sample",
      [
        {
          filename: "session-1.jsonl",
          content: createScaffoldHeavyCodexContent(
            "low-sample-1",
            "Fix the login redirect regression.",
          ),
        },
      ],
    );

    const result = await evaluateArtifacts({
      source: "codex",
      home: homeDir,
      outputMode: "summary",
    });

    expect(
      result.metrics.sampleWarnings.some((warning) =>
        /Only 1 session(?:s)? (?:was|were) available|Only 1 session(?:s)? (?:is|are) shown/i.test(
          warning,
        ),
      ),
    ).toBe(true);
    expect(
      result.metrics.sampleWarnings.some((warning) =>
        /Only 1 write session(?:s)? (?:was|were) available|Only 1 write session(?:s)? (?:appears|appear)/i.test(
          warning,
        ),
      ),
    ).toBe(true);
    expect(result.summary.overview.sampleNotes.length).toBeGreaterThan(0);
    expect(result.report).toContain("Only 1 session was available");
    expect(result.presentation.reportHtml).toContain(
      "Only 1 session was available",
    );
  });
});
