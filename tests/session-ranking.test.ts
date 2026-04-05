/**
 * Purpose: Verifies exemplar and review selection stay independent, deterministic, and de-templated in Phase 3.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Focuses on the new independent selectors rather than the old triage-only ranking path.
 */
import { describe, expect, it } from "vitest";

import { selectExemplars, selectReviewQueue } from "../src/session-ranking.js";
import { createEmptySessionLabelMap } from "../src/summary/index.js";
import type { SummarySessionRecord } from "../src/summary/types.js";
import { createV3Metrics } from "./support/v3-fixtures.js";

function createRecord(
  sessionId: string,
  overrides: {
    metrics?: Partial<SummarySessionRecord["metrics"]>;
    labels?: Partial<SummarySessionRecord["labels"]>;
    rawLabels?: Partial<SummarySessionRecord["rawLabels"]>;
    context?: Partial<NonNullable<SummarySessionRecord["context"]>>;
    attribution?: Partial<SummarySessionRecord["attribution"]>;
    template?: Partial<SummarySessionRecord["template"]>;
  } = {},
): SummarySessionRecord {
  const baseMetrics = createV3Metrics().sessions[0];
  if (!baseMetrics) {
    throw new Error("Expected fixture metrics to include a base session.");
  }

  return {
    sessionId,
    metrics: {
      ...baseMetrics,
      sessionId,
      provider: "codex",
      harness: "codex",
      startedAt: "2026-04-03T20:00:00.000Z",
      endedAt: "2026-04-03T20:05:00.000Z",
      incidentCount: 0,
      labeledTurnCount: 0,
      writeCount: 1,
      verificationCount: 1,
      verificationPassedCount: 1,
      verificationFailedCount: 0,
      endedVerified: true,
      complianceScore: 100,
      complianceRules: [
        {
          rule: "verification_after_code_changes",
          status: "pass",
          rationale: "ok",
        },
      ],
      ...overrides.metrics,
    },
    labels: {
      ...createEmptySessionLabelMap(),
      ...overrides.labels,
    },
    rawLabels: {
      ...createEmptySessionLabelMap(),
      ...overrides.rawLabels,
    },
    context: {
      sessionId,
      startedAt: "2026-04-03T20:00:00.000Z",
      cwd: "/Users/example/Projects/AI/agent-eval",
      leadPreview: `Session ${sessionId} task`,
      leadPreviewSource: "user",
      leadPreviewConfidence: "strong",
      evidencePreviews: [`Evidence for ${sessionId}`],
      evidenceSource: "assistant",
      evidenceConfidence: "strong",
      evidenceIssues: [],
      sourceRefs: [
        {
          provider: "codex",
          kind: "session_jsonl",
          path: `~/.codex/sessions/${sessionId}.jsonl`,
          line: 1,
        },
      ],
      ...overrides.context,
    },
    attribution: {
      primary: "unknown",
      confidence: "low",
      reasons: ["Transcript-visible evidence was insufficient."],
      ...overrides.attribution,
    },
    template: {
      artifactScore: 0,
      textSharePct: 0,
      hasTemplateContent: false,
      flags: [],
      dominantFamilyId: null,
      dominantFamilyLabel: null,
      ...overrides.template,
    },
  };
}

describe("Phase 3 session selection", () => {
  it("selects exemplars independently from the review queue", () => {
    const exemplar = createRecord("clean-verified", {
      context: {
        sessionId: "clean-verified",
        startedAt: "2026-04-03T20:05:00.000Z",
        cwd: "/Users/example/Projects/AI/agent-eval",
        leadPreview: "Ship the CLI cleanup and verify the package build",
        leadPreviewSource: "user",
        leadPreviewConfidence: "strong",
        evidencePreviews: [
          "I cleaned up the CLI surface, ran the verification command, and the package build now passes.",
        ],
        evidenceSource: "assistant",
        evidenceConfidence: "strong",
        evidenceIssues: [],
        sourceRefs: [],
      },
    });
    const review = createRecord("needs-review", {
      metrics: {
        incidentCount: 1,
        endedVerified: false,
        complianceScore: 60,
        verificationPassedCount: 0,
        verificationFailedCount: 1,
        complianceRules: [
          {
            rule: "verification_after_code_changes",
            status: "fail",
            rationale: "missing verification",
          },
        ],
      },
      labels: {
        regression_report: 1,
      },
      attribution: {
        primary: "agent_behavior",
        confidence: "medium",
        reasons: ["Write work ended without passing verification."],
      },
      context: {
        sessionId: "needs-review",
        startedAt: "2026-04-03T20:00:00.000Z",
        cwd: "/Users/example/Projects/AI/agent-eval",
        leadPreview: "Fix login regression and verify the build",
        leadPreviewSource: "user",
        leadPreviewConfidence: "strong",
        evidencePreviews: [
          "Please fix login and verify the patch before you finish.",
        ],
        evidenceSource: "user",
        evidenceConfidence: "strong",
        evidenceIssues: [],
        sourceRefs: [],
      },
    });

    const exemplars = selectExemplars([review, exemplar]);
    const reviewQueue = selectReviewQueue([review, exemplar], {
      excludeSessionIds: new Set(
        exemplars.map((candidate) => candidate.record.sessionId),
      ),
    });

    expect(exemplars.map((candidate) => candidate.record.sessionId)).toContain(
      "clean-verified",
    );
    expect(reviewQueue.map((candidate) => candidate.record.sessionId)).toEqual([
      "needs-review",
    ]);
  });

  it("keeps review selection free of template-only rows", () => {
    const templateOnly = createRecord("template-only", {
      attribution: {
        primary: "template_artifact",
        confidence: "high",
        reasons: ["High template text share was detected."],
      },
      template: {
        artifactScore: 75,
        textSharePct: 70,
        flags: ["template_heavy"],
        dominantFamilyId: "family-a",
        dominantFamilyLabel: "instruction_scaffold",
      },
      context: {
        sessionId: "template-only",
        startedAt: "2026-04-03T20:00:00.000Z",
        cwd: "/Users/example/Projects/AI/agent-eval",
        leadPreview: "Boilerplate session",
        leadPreviewSource: "assistant",
        leadPreviewConfidence: "medium",
        evidencePreviews: [],
        evidenceSource: "none",
        evidenceConfidence: "weak",
        evidenceIssues: ["missing_evidence"],
        sourceRefs: [],
      },
    });
    const realRisk = createRecord("real-risk", {
      metrics: {
        incidentCount: 1,
        endedVerified: false,
        complianceScore: 60,
        verificationPassedCount: 0,
        verificationFailedCount: 1,
        complianceRules: [
          {
            rule: "verification_after_code_changes",
            status: "fail",
            rationale: "missing verification",
          },
        ],
      },
      labels: {
        context_drift: 1,
      },
    });

    const reviewQueue = selectReviewQueue([templateOnly, realRisk]);
    expect(reviewQueue.map((candidate) => candidate.record.sessionId)).toEqual([
      "real-risk",
    ]);
  });

  it("limits repeated project labels early in the review queue", () => {
    const sameProjectA = createRecord("same-project-a", {
      metrics: {
        incidentCount: 1,
        endedVerified: false,
        complianceScore: 60,
      },
      labels: { regression_report: 1 },
      context: {
        cwd: "/Users/example/Projects/AI/repeated-project",
      },
    });
    const sameProjectB = createRecord("same-project-b", {
      metrics: {
        incidentCount: 1,
        endedVerified: false,
        complianceScore: 59,
      },
      labels: { regression_report: 1 },
      context: {
        cwd: "/Users/example/Projects/AI/repeated-project",
      },
    });
    const sameProjectC = createRecord("same-project-c", {
      metrics: {
        incidentCount: 1,
        endedVerified: false,
        complianceScore: 58,
      },
      labels: { regression_report: 1 },
      context: {
        cwd: "/Users/example/Projects/AI/repeated-project",
      },
    });
    const distinctProject = createRecord("distinct-project", {
      metrics: {
        incidentCount: 1,
        endedVerified: false,
        complianceScore: 57,
      },
      labels: { regression_report: 1 },
      context: {
        cwd: "/Users/example/Projects/AI/another-project",
      },
    });

    const reviewQueue = selectReviewQueue([
      sameProjectA,
      sameProjectB,
      sameProjectC,
      distinctProject,
    ]);

    expect(
      reviewQueue.slice(0, 3).map((candidate) => candidate.record.sessionId),
    ).toContain("distinct-project");
  });

  it("keeps metadata-only clean analysis sessions out of exemplars", () => {
    const metadataOnly = createRecord("metadata-only", {
      metrics: {
        writeCount: 0,
        verificationCount: 0,
        verificationPassedCount: 0,
        verificationFailedCount: 0,
        incidentCount: 0,
        complianceScore: 100,
      },
      context: {
        evidencePreviews: [
          "Follow the context prompt instructions and always include AGENTS.md and .codex/AGENTS.md in the final file selection.",
        ],
        evidenceSource: "assistant",
        evidenceConfidence: "strong",
        evidenceIssues: ["truncated_evidence", "low_signal_evidence"],
      },
    });

    const exemplars = selectExemplars([metadataOnly]);
    expect(exemplars).toEqual([]);
  });

  it("keeps weak metadata-fallback write sessions out of exemplars", () => {
    const weakMetadataWrite = createRecord("weak-metadata-write");
    weakMetadataWrite.context = {
      sessionId: "weak-metadata-write",
      startedAt: "2026-04-03T20:00:00.000Z",
      cwd: "/Users/example/Projects/AI/agent-eval",
      evidencePreviews: ["Use these exact commands."],
      evidenceSource: "user",
      evidenceConfidence: "medium",
      evidenceIssues: [],
      sourceRefs: [],
    };

    const exemplars = selectExemplars([weakMetadataWrite]);
    expect(exemplars).toEqual([]);
  });

  it("keeps low-signal ended-verified metadata rows out of review", () => {
    const weakMetadataReview = createRecord("weak-metadata-review", {
      metrics: {
        incidentCount: 0,
        endedVerified: true,
        complianceScore: 90,
      },
      labels: { context_reinjection: 1 },
    });
    weakMetadataReview.context = {
      sessionId: "weak-metadata-review",
      startedAt: "2026-04-03T20:00:00.000Z",
      cwd: "/Users/example/Projects/AI/agent-eval",
      evidencePreviews: ["copy the previous logs first as normal. then run 3"],
      evidenceSource: "user",
      evidenceConfidence: "medium",
      evidenceIssues: [],
      sourceRefs: [],
    };

    const reviewQueue = selectReviewQueue([weakMetadataReview]);
    expect(reviewQueue).toEqual([]);
  });

  it("defers repeated weak metadata rows that share the same evidence", () => {
    const repeatedA = createRecord("repeat-a", {
      metrics: {
        incidentCount: 1,
        endedVerified: false,
        complianceScore: 60,
      },
      labels: { verification_request: 1 },
    });
    repeatedA.context = {
      sessionId: "repeat-a",
      startedAt: "2026-04-03T20:00:00.000Z",
      cwd: "/Users/example/Projects/AI/agent-eval",
      evidencePreviews: [
        "Return a concise markdown report with one section per form: either 'MATCH' or a bullet list of exact field corrections using dotted paths and corrected normalized values.",
      ],
      evidenceSource: "assistant",
      evidenceConfidence: "weak",
      evidenceIssues: ["low_signal_evidence"],
      sourceRefs: [],
    };
    const repeatedB = createRecord("repeat-b", {
      metrics: {
        incidentCount: 1,
        endedVerified: false,
        complianceScore: 59,
      },
      labels: { verification_request: 1 },
    });
    repeatedB.context = {
      sessionId: "repeat-b",
      startedAt: "2026-04-03T20:00:00.000Z",
      cwd: "/Users/example/Projects/AI/agent-eval",
      evidencePreviews: [
        "Return a concise markdown report with one section per form: either 'MATCH' or a bullet list of exact field corrections using dotted paths and corrected normalized values.",
      ],
      evidenceSource: "assistant",
      evidenceConfidence: "weak",
      evidenceIssues: ["low_signal_evidence"],
      sourceRefs: [],
    };
    const realUserRow = createRecord("real-user-row", {
      metrics: {
        incidentCount: 1,
        endedVerified: false,
        complianceScore: 58,
      },
      labels: { regression_report: 1 },
      context: {
        leadPreview: "The export path is still broken after the rename.",
        leadPreviewSource: "user",
        leadPreviewConfidence: "strong",
        evidencePreviews: ["The export path is still broken after the rename."],
        evidenceSource: "user",
        evidenceConfidence: "strong",
        evidenceIssues: [],
      },
    });

    const reviewQueue = selectReviewQueue([repeatedA, repeatedB, realUserRow]);
    expect(
      reviewQueue.slice(0, 2).map((candidate) => candidate.record.sessionId),
    ).toContain("real-user-row");
    expect(reviewQueue[0]?.record.sessionId).not.toBe("repeat-b");
  });

  it("applies the template diversity guard to exemplars", () => {
    const sameFamilyA = createRecord("same-family-a", {
      template: {
        artifactScore: 10,
        textSharePct: 10,
        flags: [],
        dominantFamilyId: "family-a",
        dominantFamilyLabel: "instruction_scaffold",
      },
    });
    const sameFamilyB = createRecord("same-family-b", {
      template: {
        artifactScore: 10,
        textSharePct: 10,
        flags: [],
        dominantFamilyId: "family-a",
        dominantFamilyLabel: "instruction_scaffold",
      },
    });
    const sameFamilyC = createRecord("same-family-c", {
      template: {
        artifactScore: 10,
        textSharePct: 10,
        flags: [],
        dominantFamilyId: "family-a",
        dominantFamilyLabel: "instruction_scaffold",
      },
    });
    const distinctFamily = createRecord("distinct-family", {
      metrics: {
        complianceScore: 95,
      },
      template: {
        artifactScore: 10,
        textSharePct: 5,
        flags: [],
        dominantFamilyId: "family-b",
        dominantFamilyLabel: "repo_workflow_scaffold",
      },
    });

    const exemplars = selectExemplars([
      sameFamilyA,
      sameFamilyB,
      sameFamilyC,
      distinctFamily,
    ]);

    expect(
      exemplars.slice(0, 3).map((candidate) => candidate.record.sessionId),
    ).toContain("distinct-family");
  });
});
