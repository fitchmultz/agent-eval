/**
 * Purpose: Verifies labeled turns cluster into incidents conservatively by session, gap, and overlapping labels.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Uses synthetic turns so incident behavior stays deterministic and public-facing redaction.
 */
import { describe, expect, it } from "vitest";

import { clusterIncidents } from "../src/clustering.js";
import { createMessagePreviews } from "../src/sanitization.js";
import type { RawTurnRecord } from "../src/schema.js";

function createLabel(
  label: RawTurnRecord["labels"][number]["label"],
  overrides: Partial<RawTurnRecord["labels"][number]> = {},
): RawTurnRecord["labels"][number] {
  const family =
    label === "context_drift" ||
    label === "test_build_lint_failure_complaint" ||
    label === "regression_report" ||
    label === "stalled_or_guessing"
      ? "incident"
      : label === "praise"
        ? "positive"
        : "cue";

  return {
    label,
    family,
    severity: "low",
    confidence: "high",
    rationale: "test",
    ...overrides,
  };
}

function createMockTurn(overrides: Partial<RawTurnRecord> = {}): RawTurnRecord {
  return {
    engineVersion: "0.1.0",
    schemaVersion: "1",
    sessionId: "session-1",
    turnId: "turn-1",
    turnIndex: 0,
    userMessageCount: 1,
    assistantMessageCount: 0,
    userMessagePreviews: ["Test message"],
    assistantMessagePreviews: [],
    toolCalls: [],
    labels: [],
    sourceRefs: [
      {
        provider: "codex",
        kind: "session_jsonl",
        path: "/tmp/session.jsonl",
        line: 1,
      },
    ],
    ...overrides,
  };
}

describe("clusterIncidents", () => {
  it("merges adjacent turns that share labels in the same session", () => {
    const incidents = clusterIncidents(
      [
        {
          engineVersion: "0.1.0",
          schemaVersion: "1",
          sessionId: "session-1",
          turnId: "turn-1",
          turnIndex: 0,
          userMessageCount: 1,
          assistantMessageCount: 0,
          userMessagePreviews: [
            "# AGENTS.md instructions for /tmp/demo <INSTRUCTIONS>",
            "<environment_context> <cwd>/tmp/demo</cwd> </environment_context>",
            "Tests still fail",
          ],
          assistantMessagePreviews: [],
          toolCalls: [],
          labels: [
            createLabel("test_build_lint_failure_complaint", {
              severity: "high",
              confidence: "high",
              rationale: "failure",
            }),
          ],
          sourceRefs: [
            {
              provider: "codex",
              kind: "session_jsonl",
              path: "/tmp/session.jsonl",
              line: 1,
            },
          ],
        },
        {
          engineVersion: "0.1.0",
          schemaVersion: "1",
          sessionId: "session-1",
          turnId: "turn-2",
          turnIndex: 1,
          userMessageCount: 1,
          assistantMessageCount: 0,
          userMessagePreviews: ["Still failing after the last change"],
          assistantMessagePreviews: [],
          toolCalls: [],
          labels: [
            createLabel("test_build_lint_failure_complaint", {
              severity: "high",
              confidence: "medium",
              rationale: "failure",
            }),
          ],
          sourceRefs: [
            {
              provider: "codex",
              kind: "session_jsonl",
              path: "/tmp/session.jsonl",
              line: 2,
            },
          ],
        },
      ],
      { maxTurnGap: 2 },
      "0.1.0",
      "1",
    );

    expect(incidents).toHaveLength(1);
    expect(incidents[0]?.turnIndices).toEqual([0, 1]);
    expect(incidents[0]?.severity).toBe("high");
    expect(incidents[0]?.evidencePreviews).toEqual([
      "Still failing after the last change",
      "Tests still fail",
    ]);
  });

  it("prefers safer human evidence over unsafe transcript fragments", () => {
    const incidents = clusterIncidents(
      [
        createMockTurn({
          turnId: "turn-1",
          turnIndex: 0,
          userMessagePreviews: [
            "DID YOU FUCKING DELETE MY SSH KEYS??? [redacted-ssh-path]",
            "Git pull broke after the migration and the auth setup needs to be restored.",
          ],
          labels: [
            createLabel("stalled_or_guessing", {
              severity: "high",
              rationale: "safety",
            }),
          ],
        }),
      ],
      { maxTurnGap: 2 },
      "0.1.0",
      "1",
    );

    expect(incidents[0]?.evidencePreviews[0]).toBe(
      "Git pull broke after the migration and the auth setup needs to be restored.",
    );
  });

  it("prefers human-signal sections over batch briefing wrappers", () => {
    const incidents = clusterIncidents(
      [
        createMockTurn({
          turnId: "turn-1",
          turnIndex: 0,
          userMessagePreviews: createMessagePreviews(
            [
              `# Cloop Batch 1: Loop Surface State + Next View UX

## Mission / Scope
Fully remediate loop-surface defects in the Inbox, Next, and adjacent loop-management views for Cloop's web UI.

## Defects To Eliminate
Top Incidents still shows orchestration wrappers instead of the actual user problem signal.`,
            ],
            {
              maxItems: 3,
              maxLength: 140,
            },
          ),
          labels: [
            createLabel("regression_report", {
              severity: "high",
              rationale: "regression",
            }),
          ],
        }),
      ],
      { maxTurnGap: 2 },
      "0.1.0",
      "1",
    );

    expect(incidents[0]?.evidencePreviews[0]).toBe(
      "Top Incidents still shows orchestration wrappers instead of the actual user problem signal.",
    );
  });

  it("prefers operator problem statements over skill catalogs and trust docs", () => {
    const incidents = clusterIncidents(
      [
        createMockTurn({
          turnId: "turn-1",
          turnIndex: 0,
          userMessagePreviews: createMessagePreviews(
            [
              "- create-subagent: Create custom subagents for specialized AI tasks. Use when you want to create a new type of subagent, set up task-specific agents, configure code reviewers, debuggers, or domain-specific assistants.",
              '### Repo Execution Trust - Repo-local executable settings are gated by local `.ralph/trust.jsonc`. - Trust file shape: `{\"allow_project_commands\": true}`.',
              "- Policy drift: the repo has a safer argv-first subprocess abstraction, but shell-string execution still leaks.",
            ],
            {
              maxItems: 3,
              maxLength: 160,
            },
          ),
          labels: [
            createLabel("test_build_lint_failure_complaint", {
              severity: "high",
              rationale: "policy",
            }),
          ],
        }),
      ],
      { maxTurnGap: 2 },
      "0.1.0",
      "1",
    );

    expect(incidents[0]?.evidencePreviews[0]).toBe(
      "- Policy drift: the repo has a safer argv-first subprocess abstraction, but shell-string execution still leaks.",
    );
  });

  describe("edge cases", () => {
    it("handles empty turns array", () => {
      const incidents = clusterIncidents([], { maxTurnGap: 2 }, "0.1.0", "1");

      expect(incidents).toHaveLength(0);
    });

    it("handles single turn", () => {
      const incidents = clusterIncidents(
        [
          createMockTurn({
            turnId: "turn-1",
            turnIndex: 0,
            labels: [
              createLabel("interrupt", { rationale: "User interrupted" }),
            ],
          }),
        ],
        { maxTurnGap: 2 },
        "0.1.0",
        "1",
      );

      expect(incidents).toHaveLength(1);
      expect(incidents[0]?.turnIndices).toEqual([0]);
      expect(incidents[0]?.labels).toHaveLength(1);
      expect(incidents[0]?.labels[0]?.label).toBe("interrupt");
    });

    it("does not cluster turns from different sessions", () => {
      const incidents = clusterIncidents(
        [
          createMockTurn({
            sessionId: "session-1",
            turnId: "turn-1",
            turnIndex: 0,
            labels: [createLabel("interrupt", { rationale: "Interrupt" })],
          }),
          createMockTurn({
            sessionId: "session-2",
            turnId: "turn-2",
            turnIndex: 0,
            labels: [createLabel("interrupt", { rationale: "Interrupt" })],
          }),
        ],
        { maxTurnGap: 2 },
        "0.1.0",
        "1",
      );

      expect(incidents).toHaveLength(2);
      expect(incidents[0]?.sessionId).toBe("session-1");
      expect(incidents[1]?.sessionId).toBe("session-2");
    });

    it("clusters turns exactly at maxTurnGap boundary", () => {
      const incidents = clusterIncidents(
        [
          createMockTurn({
            turnId: "turn-1",
            turnIndex: 0,
            labels: [createLabel("interrupt", { rationale: "Interrupt" })],
          }),
          createMockTurn({
            turnId: "turn-2",
            turnIndex: 2, // Exactly at maxTurnGap of 2
            labels: [createLabel("interrupt", { rationale: "Interrupt" })],
          }),
        ],
        { maxTurnGap: 2 },
        "0.1.0",
        "1",
      );

      expect(incidents).toHaveLength(1);
      expect(incidents[0]?.turnIndices).toEqual([0, 2]);
    });

    it("does not cluster turns with gap > maxTurnGap", () => {
      const incidents = clusterIncidents(
        [
          createMockTurn({
            turnId: "turn-1",
            turnIndex: 0,
            labels: [createLabel("interrupt", { rationale: "Interrupt" })],
          }),
          createMockTurn({
            turnId: "turn-2",
            turnIndex: 4, // Gap of 4 > maxTurnGap of 2
            labels: [createLabel("interrupt", { rationale: "Interrupt" })],
          }),
        ],
        { maxTurnGap: 2 },
        "0.1.0",
        "1",
      );

      expect(incidents).toHaveLength(2);
      expect(incidents[0]?.turnIndices).toEqual([0]);
      expect(incidents[1]?.turnIndices).toEqual([4]);
    });

    it("does not cluster turns with different labels", () => {
      const incidents = clusterIncidents(
        [
          createMockTurn({
            turnId: "turn-1",
            turnIndex: 0,
            labels: [createLabel("interrupt", { rationale: "Interrupt" })],
          }),
          createMockTurn({
            turnId: "turn-2",
            turnIndex: 1,
            labels: [
              createLabel("context_drift", {
                severity: "high",
                confidence: "medium",
                rationale: "Drift",
              }),
            ],
          }),
        ],
        { maxTurnGap: 2 },
        "0.1.0",
        "1",
      );

      expect(incidents).toHaveLength(2);
      expect(incidents[0]?.labels[0]?.label).toBe("interrupt");
      expect(incidents[1]?.labels[0]?.label).toBe("context_drift");
    });

    it("merges multiple labels from same cluster", () => {
      const incidents = clusterIncidents(
        [
          createMockTurn({
            turnId: "turn-1",
            turnIndex: 0,
            labels: [createLabel("interrupt", { rationale: "Interrupt" })],
          }),
          createMockTurn({
            turnId: "turn-2",
            turnIndex: 1,
            labels: [
              createLabel("interrupt", {
                confidence: "medium",
                rationale: "Another interrupt",
              }),
              createLabel("context_reinjection", {
                severity: "medium",
                rationale: "Reinjection",
              }),
            ],
          }),
        ],
        { maxTurnGap: 2 },
        "0.1.0",
        "1",
      );

      expect(incidents).toHaveLength(1);
      expect(incidents[0]?.labels).toHaveLength(2);
      const labelNames = incidents[0]?.labels.map((l) => l.label);
      expect(labelNames).toContain("interrupt");
      expect(labelNames).toContain("context_reinjection");
    });

    it("handles turns without labels between labeled turns", () => {
      const incidents = clusterIncidents(
        [
          createMockTurn({
            turnId: "turn-1",
            turnIndex: 0,
            labels: [createLabel("interrupt", { rationale: "Interrupt" })],
          }),
          createMockTurn({
            turnId: "turn-2",
            turnIndex: 1,
            labels: [], // No labels
          }),
          createMockTurn({
            turnId: "turn-3",
            turnIndex: 2,
            labels: [createLabel("interrupt", { rationale: "Interrupt" })],
          }),
        ],
        { maxTurnGap: 2 },
        "0.1.0",
        "1",
      );

      // Should create two separate incidents because unlabeled turn breaks cluster
      expect(incidents).toHaveLength(2);
    });

    it("uses max severity and confidence from merged labels", () => {
      const incidents = clusterIncidents(
        [
          createMockTurn({
            turnId: "turn-1",
            turnIndex: 0,
            labels: [
              createLabel("interrupt", {
                confidence: "medium",
                rationale: "Low severity interrupt",
              }),
            ],
          }),
          createMockTurn({
            turnId: "turn-2",
            turnIndex: 1,
            labels: [
              createLabel("interrupt", {
                severity: "high",
                rationale: "High severity interrupt",
              }),
            ],
          }),
        ],
        { maxTurnGap: 2 },
        "0.1.0",
        "1",
      );

      expect(incidents).toHaveLength(1);
      expect(incidents[0]?.severity).toBe("high");
      expect(incidents[0]?.confidence).toBe("high");
    });

    it("handles three consecutive turns with shared labels", () => {
      const incidents = clusterIncidents(
        [
          createMockTurn({
            turnId: "turn-1",
            turnIndex: 0,
            labels: [
              createLabel("test_build_lint_failure_complaint", {
                severity: "high",
                rationale: "Failure 1",
              }),
            ],
          }),
          createMockTurn({
            turnId: "turn-2",
            turnIndex: 1,
            labels: [
              createLabel("test_build_lint_failure_complaint", {
                severity: "high",
                rationale: "Failure 2",
              }),
            ],
          }),
          createMockTurn({
            turnId: "turn-3",
            turnIndex: 2,
            labels: [
              createLabel("test_build_lint_failure_complaint", {
                severity: "high",
                rationale: "Failure 3",
              }),
            ],
          }),
        ],
        { maxTurnGap: 2 },
        "0.1.0",
        "1",
      );

      expect(incidents).toHaveLength(1);
      expect(incidents[0]?.turnIndices).toEqual([0, 1, 2]);
      expect(incidents[0]?.labels).toHaveLength(1);
    });
  });
});
