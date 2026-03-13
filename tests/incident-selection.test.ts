/**
 * Purpose: Tests for incident selection and deduplication logic.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Verifies incident ranking, deduplication, and top incident insertion.
 */
import { describe, expect, it } from "vitest";

import {
  chooseIncidentEvidencePreview,
  insertTopIncident,
} from "../src/incident-selection.js";
import type {
  IncidentRecord,
  RawTurnRecord,
  SummaryArtifact,
} from "../src/schema.js";

type TopIncident = SummaryArtifact["topIncidents"][number];

function createIncident(overrides: Partial<TopIncident> = {}): TopIncident {
  return {
    incidentId: `incident-${Math.random().toString(36).slice(2)}`,
    sessionId: "session-1",
    summary: "Test incident summary",
    severity: "medium",
    confidence: "high",
    turnSpan: 3,
    ...overrides,
  };
}

function createRawTurn(overrides: Partial<RawTurnRecord> = {}): RawTurnRecord {
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
    sourceRefs: [],
    ...overrides,
  };
}

function createIncidentRecord(
  overrides: Partial<IncidentRecord> = {},
): IncidentRecord {
  return {
    engineVersion: "0.1.0",
    schemaVersion: "1",
    incidentId: "incident-1",
    sessionId: "session-1",
    turnIds: ["turn-1"],
    turnIndices: [0],
    labels: [],
    summary: "test incident",
    evidencePreviews: ["Test message"],
    severity: "medium",
    confidence: "high",
    firstSeenAt: "2026-03-12T00:00:00.000Z",
    lastSeenAt: "2026-03-12T00:00:00.000Z",
    sourceRefs: [],
    ...overrides,
  };
}

describe("insertTopIncident", () => {
  it("adds incident to empty list", () => {
    const incident = createIncident();
    const result = insertTopIncident([], incident, 8);
    expect(result).toHaveLength(1);
    expect(result[0]?.incidentId).toBe(incident.incidentId);
  });

  it("maintains list under limit", () => {
    let topIncidents: TopIncident[] = [];
    for (let i = 0; i < 10; i++) {
      topIncidents = insertTopIncident(
        topIncidents,
        createIncident({
          incidentId: `incident-${i}`,
          sessionId: `session-${i}`, // Different sessions to avoid dedup
          summary: `Test incident ${i}`,
        }),
        5,
      );
    }
    expect(topIncidents).toHaveLength(5);
  });

  it("deduplicates by normalized summary", () => {
    const existing: TopIncident = createIncident({
      incidentId: "original",
      sessionId: "session-1",
      summary: "verification_request",
      severity: "medium",
      turnSpan: 3,
    });

    const duplicate: TopIncident = createIncident({
      incidentId: "duplicate",
      sessionId: "session-1",
      summary: "verification_request across 4 turn(s)",
      severity: "high",
      turnSpan: 4,
    });

    const result = insertTopIncident([existing], duplicate, 8);
    expect(result).toHaveLength(1);
  });

  it("keeps higher severity when deduplicating", () => {
    const existing: TopIncident = createIncident({
      incidentId: "medium-severity",
      sessionId: "session-1",
      summary: "test incident",
      severity: "medium",
      turnSpan: 3,
    });

    const higherSeverity: TopIncident = createIncident({
      incidentId: "high-severity",
      sessionId: "session-1",
      summary: "test incident",
      severity: "high",
      turnSpan: 2,
    });

    const result = insertTopIncident([existing], higherSeverity, 8);
    expect(result).toHaveLength(1);
    expect(result[0]?.incidentId).toBe("high-severity");
  });

  it("prefers non-low-signal evidence when severities are equal", () => {
    const lowSignal: TopIncident = createIncident({
      incidentId: "low-signal",
      sessionId: "session-1",
      summary: "test incident",
      severity: "high",
      evidencePreview: "AGENTS.md instructions here",
      turnSpan: 3,
    });

    const highSignal: TopIncident = createIncident({
      incidentId: "high-signal",
      sessionId: "session-1",
      summary: "test incident",
      severity: "high",
      evidencePreview: "I need help with this actual issue",
      turnSpan: 2,
    });

    const result = insertTopIncident([lowSignal], highSignal, 8);
    expect(result).toHaveLength(1);
    expect(result[0]?.incidentId).toBe("high-signal");
  });

  it("treats orchestration batch briefings as lower-signal evidence", () => {
    const batchBriefing: TopIncident = createIncident({
      incidentId: "batch-briefing",
      sessionId: "session-1",
      summary: "test incident",
      severity: "high",
      evidencePreview:
        "# Cloop Batch 1: Loop Surface State + Next View UX ## Mission / Scope Fully remediate loop-surface defects in the Inbox and Next views.",
      turnSpan: 3,
    });

    const userSignal: TopIncident = createIncident({
      incidentId: "user-signal",
      sessionId: "session-1",
      summary: "test incident",
      severity: "high",
      evidencePreview:
        "Top Incidents still shows orchestration wrappers instead of the actual user problem signal.",
      turnSpan: 2,
    });

    const result = insertTopIncident([batchBriefing], userSignal, 8);
    expect(result).toHaveLength(1);
    expect(result[0]?.incidentId).toBe("user-signal");
  });

  it("prefers safer evidence when severities are equal", () => {
    const unsafe: TopIncident = createIncident({
      incidentId: "unsafe",
      sessionId: "session-1",
      summary: "test incident",
      severity: "high",
      evidencePreview:
        "User said [redacted-sensitive-content] after the SSH key issue.",
      turnSpan: 3,
    });

    const safer: TopIncident = createIncident({
      incidentId: "safer",
      sessionId: "session-1",
      summary: "test incident",
      severity: "high",
      evidencePreview:
        "Git access broke after the migration and needs the auth setup restored.",
      turnSpan: 2,
    });

    const result = insertTopIncident([unsafe], safer, 8);
    expect(result).toHaveLength(1);
    expect(result[0]?.incidentId).toBe("safer");
  });

  it("prefers wider turn span when severity and signal quality are equal", () => {
    const narrow: TopIncident = createIncident({
      incidentId: "narrow",
      sessionId: "session-1",
      summary: "test incident",
      severity: "high",
      turnSpan: 2,
    });

    const wide: TopIncident = createIncident({
      incidentId: "wide",
      sessionId: "session-1",
      summary: "test incident",
      severity: "high",
      turnSpan: 5,
    });

    const result = insertTopIncident([narrow], wide, 8);
    expect(result).toHaveLength(1);
    expect(result[0]?.incidentId).toBe("wide");
  });

  it("sorts alphabetically by summary as final tiebreaker", () => {
    const first: TopIncident = createIncident({
      incidentId: "b",
      sessionId: "session-1",
      summary: "zebra incident",
      severity: "high",
      turnSpan: 2,
    });

    const second: TopIncident = createIncident({
      incidentId: "a",
      sessionId: "session-1",
      summary: "apple incident",
      severity: "high",
      turnSpan: 2,
    });

    const result = insertTopIncident([first], second, 8);
    expect(result).toHaveLength(2);
    expect(result[0]?.summary).toBe("apple incident");
    expect(result[1]?.summary).toBe("zebra incident");
  });

  it("handles multiple sessions without deduplication across sessions", () => {
    const session1Incident: TopIncident = createIncident({
      incidentId: "s1",
      sessionId: "session-1",
      summary: "same summary",
      severity: "high",
    });

    const session2Incident: TopIncident = createIncident({
      incidentId: "s2",
      sessionId: "session-2",
      summary: "same summary",
      severity: "high",
    });

    const result = insertTopIncident([session1Incident], session2Incident, 8);
    expect(result).toHaveLength(2);
  });

  it("normalizes summary for dedup key by removing turn count suffix", () => {
    const existing: TopIncident = createIncident({
      incidentId: "original",
      sessionId: "session-1",
      summary: "context drift detected",
      severity: "medium",
    });

    // Different turn count suffix should still be deduplicated
    const duplicate: TopIncident = createIncident({
      incidentId: "duplicate",
      sessionId: "session-1",
      summary: "context drift detected across 12 turn(s)",
      severity: "high",
    });

    const result = insertTopIncident([existing], duplicate, 8);
    expect(result).toHaveLength(1);
  });

  it("preserves better incident when replacing during deduplication", () => {
    const worse: TopIncident = createIncident({
      incidentId: "worse",
      sessionId: "session-1",
      summary: "test incident",
      severity: "low",
      confidence: "low",
      turnSpan: 1,
    });

    const better: TopIncident = createIncident({
      incidentId: "better",
      sessionId: "session-1",
      summary: "test incident",
      severity: "high",
      confidence: "high",
      turnSpan: 5,
    });

    const result = insertTopIncident([worse], better, 8);
    expect(result).toHaveLength(1);
    expect(result[0]?.incidentId).toBe("better");
  });

  it("handles incidents without evidence preview", () => {
    const withoutPreview: TopIncident = createIncident({
      incidentId: "no-preview",
      sessionId: "session-1",
      summary: "test incident",
      severity: "high",
      evidencePreview: undefined,
    });

    const result = insertTopIncident([], withoutPreview, 8);
    expect(result).toHaveLength(1);
    expect(result[0]?.incidentId).toBe("no-preview");
  });
});

describe("chooseIncidentEvidencePreview", () => {
  it("falls back to stronger same-session user signal when incident evidence is low-signal", () => {
    const incident = createIncidentRecord({
      turnIds: ["turn-1", "turn-2"],
      turnIndices: [0, 1],
      evidencePreviews: [
        "The human user will interrupt if they need your attention, otherwise remain focused on the task.",
        '**Ask the chat when stuck:** ```json {"tool":"chat_send","args":{"chat_id":"<same chat_id>"}} ```',
      ],
    });
    const turns = [
      createRawTurn({
        turnId: "turn-1",
        turnIndex: 0,
        userMessagePreviews: [
          "The human user will interrupt if they need your attention, otherwise remain focused on the task.",
        ],
      }),
      createRawTurn({
        turnId: "turn-2",
        turnIndex: 1,
        userMessagePreviews: [
          '**Ask the chat when stuck:** ```json {"tool":"chat_send","args":{"chat_id":"<same chat_id>"}} ```',
        ],
      }),
      createRawTurn({
        turnId: "turn-3",
        turnIndex: 2,
        userMessagePreviews: [
          "Please implement the Swift-side change, add regression coverage if the slice already has tests, and report any follow-up risks.",
        ],
      }),
    ];

    expect(chooseIncidentEvidencePreview(incident, turns)).toBe(
      "Please implement the Swift-side change, add regression coverage if the slice already has tests, and report any follow-up risks.",
    );
  });

  it("avoids ssh recovery phrasing when a nearby operator complaint is available", () => {
    const incident = createIncidentRecord({
      turnIds: ["turn-12", "turn-13"],
      turnIndices: [12, 13],
      evidencePreviews: [
        "Checking the actual key state now. If the encrypted artifacts are usable, I'll restore ~/.ssh immediately.",
      ],
    });
    const turns = [
      createRawTurn({
        turnId: "turn-11",
        turnIndex: 11,
        userMessagePreviews: [
          "Please make sure you have the correct access rights and the repository exists.",
        ],
      }),
      createRawTurn({
        turnId: "turn-12",
        turnIndex: 12,
        userMessagePreviews: [
          "Checking the actual key state now. If the encrypted artifacts are usable, I'll restore ~/.ssh immediately.",
        ],
      }),
      createRawTurn({
        turnId: "turn-13",
        turnIndex: 13,
        userMessagePreviews: [
          "This is catastrophic level of nonsense.",
        ],
      }),
    ];

    expect(chooseIncidentEvidencePreview(incident, turns)).toBe(
      "Please make sure you have the correct access rights and the repository exists.",
    );
  });
});
