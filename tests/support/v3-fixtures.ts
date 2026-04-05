/**
 * Purpose: Shared v3 fixture builders for report, presentation, evaluator, and artifact-writer tests.
 * Responsibilities: Provide deterministic canonical metrics, summary, and session-facts fixtures aligned to schema v3.
 * Scope: Test-only helpers to reduce repeated hand-built summary literals during the v3 cutover.
 * Usage: Import `createV3Metrics`, `createV3Summary`, and related helpers from tests.
 * Invariants/Assumptions: Fixtures stay synthetic, public-safe, and intentionally minimal while satisfying strict schemas.
 */

import type {
  IncidentRecord,
  MetricsRecord,
  RawTurnRecord,
  SessionFactRecord,
  SummaryArtifact,
} from "../../src/schema.js";

export function createV3Metrics(
  overrides: Partial<MetricsRecord> = {},
): MetricsRecord {
  return {
    engineVersion: "0.1.0",
    schemaVersion: "3",
    generatedAt: "2026-04-03T20:00:00.000Z",
    sessionCount: 2,
    corpusScope: {
      selection: "all_discovered",
      discoveredSessionCount: 2,
      eligibleSessionCount: 2,
      appliedSessionLimit: null,
      startDate: null,
      endDate: null,
      timeBucket: "week",
      undatedExcludedCount: 0,
    },
    appliedFilters: {
      startDate: null,
      endDate: null,
      sessionLimit: null,
      timeBucket: "week",
      discoveredSessionCount: 2,
      eligibleSessionCount: 2,
      undatedExcludedCount: 0,
    },
    turnCount: 8,
    incidentCount: 1,
    parseWarningCount: 0,
    labelCounts: {
      verification_request: 1,
      context_reinjection: 1,
      interrupt: 1,
    },
    complianceSummary: [
      {
        rule: "verification_after_code_changes",
        passCount: 1,
        failCount: 1,
        notApplicableCount: 0,
        unknownCount: 0,
      },
    ],
    providerDistribution: [
      { key: "codex", label: "codex", count: 1, pct: 50 },
      { key: "pi", label: "pi", count: 1, pct: 50 },
    ],
    harnessDistribution: {
      values: [
        { key: "codex", label: "codex", count: 1, pct: 50 },
        { key: "pi", label: "pi", count: 1, pct: 50 },
      ],
      coverage: {
        coveredSessionCount: 2,
        totalSessionCount: 2,
        coveragePct: 100,
      },
    },
    modelDistribution: {
      values: [
        {
          key: "anthropic/claude-sonnet-4-6",
          label: "anthropic/claude-sonnet-4-6",
          count: 1,
          pct: 100,
        },
      ],
      coverage: {
        coveredSessionCount: 1,
        totalSessionCount: 2,
        coveragePct: 50,
      },
    },
    messageStats: {
      totalUserMessages: 3,
      totalAssistantMessages: 4,
      avgUserMessagesPerSession: 1.5,
      avgAssistantMessagesPerSession: 2,
    },
    toolStats: {
      totalToolCallCount: 2,
      totalWriteToolCallCount: 1,
      totalVerificationToolCallCount: 2,
      avgToolCallsPerSession: 1,
      avgWriteToolCallsPerSession: 0.5,
      avgVerificationToolCallsPerSession: 1,
      topTools: [
        { key: "exec_command", label: "exec_command", count: 1, pct: 50 },
        { key: "bash", label: "bash", count: 1, pct: 50 },
      ],
      toolFamilyDistribution: [
        { key: "verification", label: "verification", count: 2, pct: 100 },
      ],
    },
    mcpStats: {
      sessionCountWithMcp: 0,
      sessionSharePct: 0,
      totalToolCallCount: 0,
      serverDistribution: [],
    },
    tokenStats: {
      coverage: {
        coveredSessionCount: 0,
        totalSessionCount: 2,
        coveragePct: 0,
      },
      inputTokensAvg: null,
      outputTokensAvg: null,
      totalTokensAvg: null,
    },
    durationStats: {
      coverage: {
        coveredSessionCount: 2,
        totalSessionCount: 2,
        coveragePct: 100,
      },
      avgDurationMs: 3500,
      medianDurationMs: 3500,
    },
    compactionStats: {
      coverage: {
        coveredSessionCount: 0,
        totalSessionCount: 2,
        coveragePct: 0,
      },
      avgCompactionCount: null,
      sessionCountWithCompaction: 0,
      sessionSharePct: 0,
    },
    attributionSummary: {
      user_scope: 0,
      agent_behavior: 1,
      template_artifact: 0,
      mixed: 0,
      unknown: 1,
    },
    templateSubstrate: {
      affectedSessionCount: 0,
      affectedSessionPct: 0,
      estimatedTemplateTextSharePct: 0,
      topFamilies: [],
    },
    temporalBuckets: {
      bucket: "week",
      values: [
        {
          key: "2026-03-02",
          label: "2026-03-02",
          sessionCount: 2,
          writeSessionCount: 2,
          endedVerifiedCount: 1,
          incidentCount: 1,
        },
      ],
    },
    coverageWarnings: [
      "Token coverage is unavailable for the selected corpus, so token averages are null rather than false zeros.",
    ],
    sampleWarnings: [
      "Only 2 sessions were available in the selected corpus, so broad product conclusions should be treated as low sample.",
    ],
    sessions: [
      {
        sessionId: "session-1",
        provider: "codex",
        harness: "codex",
        modelProvider: null,
        model: null,
        startedAt: "2026-04-03T20:00:00.000Z",
        endedAt: "2026-04-03T20:04:00.000Z",
        durationMs: 240000,
        turnCount: 4,
        labeledTurnCount: 2,
        incidentCount: 1,
        parseWarningCount: 0,
        userMessageCount: 2,
        assistantMessageCount: 2,
        toolCallCount: 1,
        writeToolCallCount: 0,
        verificationToolCallCount: 1,
        mcpToolCallCount: 0,
        topTools: [{ toolName: "exec_command", count: 1 }],
        toolFamilies: [{ family: "verification", count: 1 }],
        mcpServers: [],
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        compactionCount: null,
        writeCount: 1,
        verificationCount: 1,
        verificationPassedCount: 0,
        verificationFailedCount: 1,
        postWriteVerificationAttempted: true,
        postWriteVerificationPassed: false,
        endedVerified: false,
        complianceScore: 60,
        complianceRules: [
          {
            rule: "verification_after_code_changes",
            status: "fail",
            rationale: "verification missing",
          },
        ],
      },
      {
        sessionId: "session-2",
        provider: "pi",
        harness: "pi",
        modelProvider: "anthropic",
        model: "claude-sonnet-4-6",
        startedAt: "2026-04-03T20:05:00.000Z",
        endedAt: "2026-04-03T20:08:00.000Z",
        durationMs: 180000,
        turnCount: 4,
        labeledTurnCount: 0,
        incidentCount: 0,
        parseWarningCount: 0,
        userMessageCount: 1,
        assistantMessageCount: 2,
        toolCallCount: 1,
        writeToolCallCount: 1,
        verificationToolCallCount: 1,
        mcpToolCallCount: 0,
        topTools: [{ toolName: "bash", count: 1 }],
        toolFamilies: [{ family: "verification", count: 1 }],
        mcpServers: [],
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        compactionCount: null,
        writeCount: 1,
        verificationCount: 1,
        verificationPassedCount: 1,
        verificationFailedCount: 0,
        postWriteVerificationAttempted: true,
        postWriteVerificationPassed: true,
        endedVerified: true,
        complianceScore: 95,
        complianceRules: [
          {
            rule: "verification_after_code_changes",
            status: "pass",
            rationale: "verification passed",
          },
        ],
      },
    ],
    inventory: [
      {
        provider: "codex",
        kind: "session_jsonl",
        path: "~/.codex/sessions",
        discovered: true,
        required: true,
        optional: false,
      },
      {
        provider: "pi",
        kind: "session_jsonl",
        path: "~/.pi/agent/sessions",
        discovered: true,
        required: true,
        optional: false,
      },
    ],
    ...overrides,
  };
}

export function createV3Summary(
  overrides: Partial<SummaryArtifact> = {},
): SummaryArtifact {
  return {
    engineVersion: "0.1.0",
    schemaVersion: "3",
    generatedAt: "2026-04-03T20:00:00.000Z",
    overview: {
      title: "Transcript Analytics Report",
      corpusContext:
        "codex, pi corpus · 2 sessions · full corpus · generated 2026-04-03T20:00:00.000Z",
      appliedFilters: [],
      coverageNotes: [],
      sampleNotes: [],
      highlights: [
        "2 sessions were analyzed across codex and pi.",
        "1 exemplar session and 1 review session were surfaced from the de-templated transcript substrate.",
        "1 of 2 write sessions ended without a passing post-write verification signal.",
      ],
    },
    usageDashboard: {
      headlineMetrics: {
        sessions: 2,
        writeSessions: 2,
        endedVerified: 1,
        endedUnverified: 1,
        avgUserMessagesPerSession: 1.5,
        avgAssistantMessagesPerSession: 2,
        avgToolCallsPerSession: 1,
        mcpSessionShare: null,
        interruptRatePer100Turns: 12.5,
        compactionRate: null,
      },
      distributions: {
        providers: [
          { key: "codex", label: "codex", count: 1, pct: 50 },
          { key: "pi", label: "pi", count: 1, pct: 50 },
        ],
        harnesses: [
          { key: "codex", label: "codex", count: 1, pct: 50 },
          { key: "pi", label: "pi", count: 1, pct: 50 },
        ],
        models: [],
        toolFamilies: [],
        attribution: [
          { key: "agent_behavior", label: "agent_behavior", count: 1, pct: 50 },
          { key: "unknown", label: "unknown", count: 1, pct: 50 },
        ],
      },
      tokenCoverage: null,
      tokenStats: null,
      diagnostics: {
        labelCounts: [
          { label: "verification_request", count: 1 },
          { label: "context_reinjection", count: 1 },
        ],
        incidentSeverities: [
          { severity: "info", count: 0 },
          { severity: "low", count: 0 },
          { severity: "medium", count: 1 },
          { severity: "high", count: 0 },
        ],
        compliance: [
          {
            rule: "verification_after_code_changes",
            passCount: 1,
            failCount: 1,
            notApplicableCount: 0,
            unknownCount: 0,
            passRate: 50,
            affectedSessionCount: 2,
          },
        ],
      },
      notes: [],
    },
    exemplarSessions: [
      {
        sessionId: "session-2",
        shortId: "session-2",
        title: "Ship the CLI cleanup and verify the package build",
        timestampLabel: "2026-04-03 20:05Z",
        projectLabel: "agent-eval",
        provider: "pi",
        harness: "pi",
        metrics: {
          turnCount: 4,
          writeCount: 1,
          incidentCount: 0,
          complianceScore: 95,
          endedVerified: true,
        },
        attribution: {
          primary: "unknown",
          confidence: "low",
          reasons: ["Transcript-visible evidence was insufficient."],
        },
        reasonTags: [
          "Ended-Verified Delivery",
          "Verification after code changes",
        ],
        whyIncluded: [
          "Ended with a passing post-write verification signal after code changes.",
        ],
        evidencePreviews: [
          "I cleaned up the CLI surface, ran the verification command, and the package build now passes.",
        ],
        sourceRefs: [
          {
            provider: "pi",
            kind: "session_jsonl",
            path: "~/.pi/agent/sessions/b.jsonl",
          },
        ],
        provenance: {
          titleSource: "user",
          titleConfidence: "strong",
          evidenceSource: "assistant",
          evidenceConfidence: "strong",
          issues: [],
          trustFlags: [],
        },
      },
    ],
    reviewQueue: [
      {
        sessionId: "session-1",
        shortId: "session-1",
        title: "Fix login regression and verify the build",
        timestampLabel: "2026-04-03 20:00Z",
        projectLabel: "agent-eval",
        provider: "codex",
        harness: "codex",
        metrics: {
          turnCount: 4,
          writeCount: 1,
          incidentCount: 1,
          complianceScore: 60,
          endedVerified: false,
        },
        attribution: {
          primary: "agent_behavior",
          confidence: "medium",
          reasons: ["Write work ended without passing verification."],
        },
        reasonTags: ["agent_behavior", "Verification after code changes"],
        whyIncluded: [
          "Ended without a passing post-write verification after code changes.",
        ],
        evidencePreviews: [
          "Please fix login and verify the patch before you finish.",
        ],
        sourceRefs: [
          {
            provider: "codex",
            kind: "session_jsonl",
            path: "~/.codex/sessions/a.jsonl",
          },
        ],
        provenance: {
          titleSource: "user",
          titleConfidence: "strong",
          evidenceSource: "user",
          evidenceConfidence: "strong",
          issues: [],
          trustFlags: [],
        },
      },
    ],
    attributionSummary: {
      counts: {
        user_scope: 0,
        agent_behavior: 1,
        template_artifact: 0,
        mixed: 0,
        unknown: 1,
      },
      notes: [],
    },
    templateSubstrate: {
      affectedSessionCount: 0,
      affectedSessionPct: 0,
      estimatedTemplateTextSharePct: 0,
      topFamilies: [],
      notes: [
        {
          code: "template_none_detected",
          level: "info",
          message:
            "No repeated scaffold families were strong enough to classify in the selected corpus.",
        },
      ],
    },
    learningPatterns: {
      whatToCopy: [
        {
          id: "verify_after_write_before_close",
          label: "Verify after write before close",
          explanation:
            "Successful delivery sessions usually captured a passing verification after the main write work rather than stopping at the code change.",
          sessionCount: 1,
          sourceSessionIds: ["session-2"],
        },
      ],
      whatToAvoid: [
        {
          id: "ended_unverified_after_write",
          label: "Write work ended unverified",
          explanation:
            "A repeated failure pattern was ending after edits without a visible passing verification signal.",
          sessionCount: 1,
          sourceSessionIds: ["session-1"],
        },
      ],
      userScopePatterns: [],
      agentBehaviorPatterns: [
        {
          id: "agent_breakage_after_write",
          label: "Agent introduces breakage after write",
          explanation:
            "Agent-behavior sessions often combined write activity with unverified endings or explicit regression complaints.",
          sessionCount: 1,
          sourceSessionIds: ["session-1"],
        },
      ],
      mixedPatterns: [],
      unknownPatterns: [
        {
          id: "insufficient_transcript_visible_evidence",
          label: "Transcript-visible evidence stays inconclusive",
          explanation:
            "Unknown attribution remains appropriate when the surviving public-safe transcript surface cannot support a stronger causal claim.",
          sessionCount: 1,
          sourceSessionIds: ["session-2"],
        },
      ],
    },
    comparativeSlices: [
      {
        key: "selected_corpus",
        label: "Selected Corpus",
        kind: "selected_corpus",
        filters: [],
        metrics: {
          sessionCount: 2,
          turnCount: 8,
          incidentCount: 1,
          writeSessionCount: 2,
          endedVerifiedCount: 1,
          endedUnverifiedCount: 1,
          incidentsPer100Turns: 12.5,
          interruptRatePer100Turns: 12.5,
        },
        notes: [],
      },
    ],
    ...overrides,
  };
}

export function createSessionFacts(
  overrides: Partial<SessionFactRecord> = {},
): SessionFactRecord[] {
  return [
    {
      engineVersion: "0.1.0",
      schemaVersion: "3",
      sessionId: "session-1",
      shortId: "session-1",
      provider: "codex",
      harness: null,
      modelProvider: null,
      model: null,
      startedAt: "2026-04-03T20:00:00.000Z",
      endedAt: null,
      durationMs: null,
      metrics: {
        turnCount: 4,
        userMessageCount: 2,
        assistantMessageCount: 2,
        toolCallCount: 1,
        writeToolCallCount: 1,
        verificationToolCallCount: 1,
        mcpToolCallCount: null,
        writeCount: 1,
        verificationCount: 1,
        endedVerified: false,
        complianceScore: 60,
        failedRules: ["Verification after code changes"],
      },
      topTools: [{ toolName: "apply_patch", count: 1 }],
      mcpServers: [],
      rawLabelCounts: [{ label: "verification_request", count: 1 }],
      deTemplatedLabelCounts: [{ label: "verification_request", count: 1 }],
      template: {
        artifactScore: null,
        textSharePct: null,
        flags: [],
      },
      attribution: {
        primary: "agent_behavior",
        confidence: "medium",
        reasons: ["Write work ended without passing verification."],
      },
      title: "Fix login regression and verify the build",
      evidencePreviews: [
        "Please fix login and verify the patch before you finish.",
      ],
      sourceRefs: [
        {
          provider: "codex",
          kind: "session_jsonl",
          path: "~/.codex/sessions/a.jsonl",
        },
      ],
      surfacedIn: {
        exemplar: false,
        reviewQueue: true,
      },
      ...overrides,
    },
  ];
}

export function createRawTurns(): RawTurnRecord[] {
  return [
    {
      engineVersion: "0.1.0",
      schemaVersion: "3",
      sessionId: "session-1",
      turnId: "turn-1",
      turnIndex: 0,
      userMessageCount: 1,
      assistantMessageCount: 1,
      userMessagePreviews: [
        "Please fix login and verify the patch before you finish.",
      ],
      assistantMessagePreviews: [
        "I will patch login and verify after the final write.",
      ],
      toolCalls: [
        {
          toolName: "apply_patch",
          category: "write",
          commandText: undefined,
          writeLike: true,
          verificationLike: false,
          status: "completed",
        },
      ],
      labels: [
        {
          label: "verification_request",
          family: "incident",
          severity: "medium",
          confidence: "high",
          rationale: "User had to ask for verification.",
        },
      ],
      sourceRefs: [
        {
          provider: "codex",
          kind: "session_jsonl",
          path: "~/.codex/sessions/a.jsonl",
          line: 1,
        },
      ],
    },
    {
      engineVersion: "0.1.0",
      schemaVersion: "3",
      sessionId: "session-2",
      turnId: "turn-2",
      turnIndex: 0,
      userMessageCount: 1,
      assistantMessageCount: 1,
      userMessagePreviews: [
        "Please clean up the CLI surface and verify the package build before you finish.",
      ],
      assistantMessagePreviews: [
        "I cleaned up the CLI surface, ran the verification command, and the package build now passes.",
      ],
      toolCalls: [
        {
          toolName: "bash",
          category: "verification",
          commandText: "pnpm build",
          writeLike: false,
          verificationLike: true,
          status: "completed",
        },
      ],
      labels: [],
      sourceRefs: [
        {
          provider: "pi",
          kind: "session_jsonl",
          path: "~/.pi/agent/sessions/b.jsonl",
          line: 1,
        },
      ],
    },
  ];
}

export function createIncidents(): IncidentRecord[] {
  return [
    {
      engineVersion: "0.1.0",
      schemaVersion: "3",
      incidentId: "incident-1",
      sessionId: "session-1",
      turnIds: ["turn-1"],
      turnIndices: [0],
      labels: [
        {
          label: "verification_request",
          family: "incident",
          severity: "medium",
          confidence: "high",
          rationale: "User had to ask for verification.",
        },
      ],
      summary: "verification request surfaced",
      evidencePreviews: ["Please verify after the patch."],
      severity: "medium",
      confidence: "high",
      sourceRefs: [
        {
          provider: "codex",
          kind: "session_jsonl",
          path: "~/.codex/sessions/a.jsonl",
          line: 1,
        },
      ],
    },
  ];
}
