/**
 * Purpose: Verifies labeled turns cluster into incidents conservatively by session, gap, and overlapping labels.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Uses synthetic turns so incident behavior stays deterministic and public-safe.
 */
import { describe, expect, it } from "vitest";

import { clusterIncidents } from "../src/clustering.js";

describe("clusterIncidents", () => {
  it("merges adjacent turns that share labels in the same session", () => {
    const incidents = clusterIncidents(
      [
        {
          evaluatorVersion: "0.1.0",
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
            {
              label: "test_build_lint_failure_complaint",
              severity: "high",
              confidence: "high",
              rationale: "failure",
            },
          ],
          sourceRefs: [
            { kind: "session_jsonl", path: "/tmp/session.jsonl", line: 1 },
          ],
        },
        {
          evaluatorVersion: "0.1.0",
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
            {
              label: "test_build_lint_failure_complaint",
              severity: "high",
              confidence: "medium",
              rationale: "failure",
            },
          ],
          sourceRefs: [
            { kind: "session_jsonl", path: "/tmp/session.jsonl", line: 2 },
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
      "Tests still fail",
      "Still failing after the last change",
    ]);
  });
});
