/**
 * Purpose: Computes deterministic core summary data like rankings, rates, slices, and incident selection.
 * Entrypoint: `buildSummaryCore()` and `buildSummaryInputsFromArtifacts()` feed the higher-level summary facade.
 * Notes: This module intentionally excludes presentation-only decorations so the canonical summary logic stays focused.
 */
import { isLowSignalPreview } from "./sanitization.js";
import type {
  IncidentRecord,
  LabelName,
  MetricsRecord,
  RawTurnRecord,
  SessionArchetype,
  Severity,
  SummaryArtifact,
} from "./schema.js";
import {
  complianceRuleValues,
  labelTaxonomy,
  severityValues,
} from "./schema.js";

export interface SummaryInputs {
  sessionLabelCounts: Map<string, Record<LabelName, number>>;
  topIncidents: SummaryArtifact["topIncidents"];
  severityCounts: Record<Severity, number>;
  writeTurnCount: number;
}

export interface SessionInsightRow {
  sessionId: string;
  archetype: SessionArchetype;
  archetypeLabel: string;
  frictionScore: number;
  complianceScore: number;
  incidentCount: number;
  labeledTurnCount: number;
  writeCount: number;
  verificationPassedCount: number;
  dominantLabels: LabelName[];
  note: string;
}

export interface ScoreSnapshot {
  proofScore: number;
  flowScore: number;
  disciplineScore: number;
  writeVerificationRate: number;
  incidentsPer100Turns: number;
}

export interface SummaryCoreData {
  labels: SummaryArtifact["labels"];
  severities: SummaryArtifact["severities"];
  compliance: SummaryArtifact["compliance"];
  rates: SummaryArtifact["rates"];
  delivery: SummaryArtifact["delivery"];
  comparativeSlices: SummaryArtifact["comparativeSlices"];
  topSessions: SummaryArtifact["topSessions"];
  victoryLaps: SummaryArtifact["victoryLaps"];
  topIncidents: SummaryArtifact["topIncidents"];
}

type ComparativeSlice = SummaryArtifact["comparativeSlices"][number];
type ScoreCard = SummaryArtifact["scoreCards"][number];

const labelWeights: Record<LabelName, number> = {
  context_drift: 4,
  test_build_lint_failure_complaint: 5,
  interrupt: 2,
  regression_report: 5,
  praise: -1,
  context_reinjection: 2,
  verification_request: 2,
  stalled_or_guessing: 5,
};

const severityOrder = new Map<Severity, number>(
  severityValues.map((value, index) => [value, index]),
);

function archetypeLabel(archetype: SessionArchetype): string {
  switch (archetype) {
    case "verified_delivery":
      return "Clean Ship";
    case "unverified_delivery":
      return "Needs Proof";
    case "high_friction_recovery":
      return "Recovery Run";
    case "interrupted_non_write":
      return "Interrupted Pass";
    case "analysis_only":
      return "Recon Only";
  }
}

export function countLabel(
  labels: MetricsRecord["labelCounts"],
  label: LabelName,
): number {
  return labels[label] ?? 0;
}

export function safeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(1));
}

export function createEmptySessionLabelMap(): Record<LabelName, number> {
  return {
    context_drift: 0,
    test_build_lint_failure_complaint: 0,
    interrupt: 0,
    regression_report: 0,
    praise: 0,
    context_reinjection: 0,
    verification_request: 0,
    stalled_or_guessing: 0,
  };
}

export function createEmptySeverityCounts(): Record<Severity, number> {
  return {
    info: 0,
    low: 0,
    medium: 0,
    high: 0,
  };
}

export function collectSessionLabelCounts(
  rawTurns: readonly RawTurnRecord[],
): Map<string, Record<LabelName, number>> {
  const counts = new Map<string, Record<LabelName, number>>();

  for (const turn of rawTurns) {
    const sessionCounts =
      counts.get(turn.sessionId) ?? createEmptySessionLabelMap();
    for (const label of turn.labels) {
      sessionCounts[label.label] += 1;
    }
    counts.set(turn.sessionId, sessionCounts);
  }

  return counts;
}

export function countWriteTurns(rawTurns: readonly RawTurnRecord[]): number {
  return rawTurns.filter((turn) =>
    turn.toolCalls.some((tool) => tool.writeLike),
  ).length;
}

function calculateFrictionScore(
  labelCounts: Record<LabelName, number>,
  complianceScore: number,
): number {
  const weighted = labelTaxonomy.reduce(
    (total, label) => total + labelCounts[label] * labelWeights[label],
    0,
  );
  const compliancePenalty = Math.max(0, 100 - complianceScore) / 10;
  return Number(Math.max(0, weighted + compliancePenalty).toFixed(1));
}

function dominantLabelsForSession(
  labelCounts: Record<LabelName, number>,
): LabelName[] {
  return [...labelTaxonomy]
    .filter((label) => labelCounts[label] > 0)
    .sort(
      (left, right) =>
        labelCounts[right] - labelCounts[left] || left.localeCompare(right),
    )
    .slice(0, 3);
}

function determineArchetype(
  writeCount: number,
  verificationPassedCount: number,
  dominantLabels: readonly LabelName[],
  frictionScore: number,
): SessionArchetype {
  if (writeCount > 0 && verificationPassedCount > 0) {
    return frictionScore >= 6 ? "high_friction_recovery" : "verified_delivery";
  }
  if (writeCount > 0) {
    return "unverified_delivery";
  }
  if (dominantLabels.includes("interrupt")) {
    return "interrupted_non_write";
  }
  return "analysis_only";
}

function createArchetypeNote(
  archetype: SessionArchetype,
  dominantLabels: readonly LabelName[],
  session: MetricsRecord["sessions"][number],
): string {
  switch (archetype) {
    case "verified_delivery":
      return `Code changes were followed by passing verification (${session.verificationPassedCount}/${session.verificationCount}).`;
    case "unverified_delivery":
      return "Code changes were observed without a passing verification signal.";
    case "high_friction_recovery":
      return `The session delivered verified changes, but only after notable operator burden: ${dominantLabels.join(", ")}.`;
    case "interrupted_non_write":
      return `The session stayed non-write and was dominated by interruption-style signals: ${dominantLabels.join(", ")}.`;
    case "analysis_only":
      return dominantLabels.length > 0
        ? `The session remained analysis-heavy; dominant user signals were ${dominantLabels.join(", ")}.`
        : "The session remained analysis-only with no dominant incident label.";
  }
}

export function buildTopSessions(
  metrics: MetricsRecord,
  sessionLabelCounts: Map<string, Record<LabelName, number>>,
): SessionInsightRow[] {
  return metrics.sessions
    .map((session) => {
      const labelCounts =
        sessionLabelCounts.get(session.sessionId) ??
        createEmptySessionLabelMap();
      const dominantLabels = dominantLabelsForSession(labelCounts);
      const frictionScore = calculateFrictionScore(
        labelCounts,
        session.complianceScore,
      );
      const archetype = determineArchetype(
        session.writeCount,
        session.verificationPassedCount,
        dominantLabels,
        frictionScore,
      );

      return {
        sessionId: session.sessionId,
        archetype,
        archetypeLabel: archetypeLabel(archetype),
        frictionScore,
        complianceScore: session.complianceScore,
        incidentCount: session.incidentCount,
        labeledTurnCount: session.labeledTurnCount,
        writeCount: session.writeCount,
        verificationPassedCount: session.verificationPassedCount,
        dominantLabels,
        note: createArchetypeNote(archetype, dominantLabels, session),
      };
    })
    .sort(
      (left, right) =>
        right.frictionScore - left.frictionScore ||
        right.incidentCount - left.incidentCount ||
        left.sessionId.localeCompare(right.sessionId),
    );
}

export function buildVictoryLaps(
  topSessions: readonly SessionInsightRow[],
): SessionInsightRow[] {
  return topSessions
    .filter((session) => session.archetype === "verified_delivery")
    .sort(
      (left, right) =>
        right.complianceScore - left.complianceScore ||
        right.verificationPassedCount - left.verificationPassedCount ||
        left.incidentCount - right.incidentCount ||
        left.frictionScore - right.frictionScore ||
        left.sessionId.localeCompare(right.sessionId),
    )
    .slice(0, 6);
}

function findComplianceRule(
  metrics: MetricsRecord,
  ruleName: SummaryArtifact["compliance"][number]["rule"],
): SummaryArtifact["compliance"][number] | undefined {
  return metrics.complianceSummary.find((rule) => rule.rule === ruleName);
}

function applicablePassRate(
  metrics: MetricsRecord,
  ruleName: SummaryArtifact["compliance"][number]["rule"],
): number {
  const rule = findComplianceRule(metrics, ruleName);
  if (!rule) {
    return 0;
  }

  return safeRate(rule.passCount, rule.passCount + rule.failCount);
}

export function toneForScore(score: number): ScoreCard["tone"] {
  if (score >= 90) {
    return "good";
  }
  if (score >= 70) {
    return "neutral";
  }
  if (score >= 40) {
    return "warn";
  }
  return "danger";
}

export function buildScoreSnapshot(metrics: MetricsRecord): ScoreSnapshot {
  const sessionsWithWrites = metrics.sessions.filter(
    (session) => session.writeCount > 0,
  );
  const verifiedWriteSessions = sessionsWithWrites.filter(
    (session) => session.verificationPassedCount > 0,
  );
  const writeVerificationRate = safeRate(
    verifiedWriteSessions.length,
    sessionsWithWrites.length,
  );
  const proofScore = Math.round(writeVerificationRate);
  const flowPenalty =
    safeRate(countLabel(metrics.labelCounts, "interrupt"), metrics.turnCount) *
      8 +
    safeRate(
      countLabel(metrics.labelCounts, "context_reinjection"),
      metrics.turnCount,
    ) *
      20 +
    safeRate(
      countLabel(metrics.labelCounts, "context_drift"),
      metrics.turnCount,
    ) *
      40;
  const flowScore = Math.max(0, Math.round(100 - flowPenalty));
  const disciplineScore = Math.round(
    (applicablePassRate(metrics, "scope_confirmed_before_major_write") +
      applicablePassRate(metrics, "cwd_or_repo_echoed_before_write") +
      applicablePassRate(metrics, "short_plan_before_large_change") +
      applicablePassRate(metrics, "verification_after_code_changes")) /
      4,
  );

  return {
    proofScore,
    flowScore,
    disciplineScore,
    writeVerificationRate,
    incidentsPer100Turns: safeRate(metrics.incidentCount, metrics.turnCount),
  };
}

function aggregateComplianceSummary(
  sessions: readonly MetricsRecord["sessions"][number][],
): SummaryArtifact["compliance"] {
  const summary = complianceRuleValues.map((rule) => ({
    rule,
    passCount: 0,
    failCount: 0,
    notApplicableCount: 0,
    unknownCount: 0,
  }));

  for (const session of sessions) {
    for (const rule of session.complianceRules) {
      const entry = summary.find((candidate) => candidate.rule === rule.rule);
      if (!entry) {
        continue;
      }

      if (rule.status === "pass") {
        entry.passCount += 1;
      } else if (rule.status === "fail") {
        entry.failCount += 1;
      } else if (rule.status === "not_applicable") {
        entry.notApplicableCount += 1;
      } else {
        entry.unknownCount += 1;
      }
    }
  }

  return summary;
}

function aggregateLabelCounts(
  sessions: readonly MetricsRecord["sessions"][number][],
  sessionLabelCounts: Map<string, Record<LabelName, number>>,
): MetricsRecord["labelCounts"] {
  const counts: MetricsRecord["labelCounts"] = {};

  for (const session of sessions) {
    const labels =
      sessionLabelCounts.get(session.sessionId) ?? createEmptySessionLabelMap();
    for (const label of labelTaxonomy) {
      if (labels[label] <= 0) {
        continue;
      }

      counts[label] = (counts[label] ?? 0) + labels[label];
    }
  }

  return counts;
}

function createSubsetMetrics(
  metrics: MetricsRecord,
  sessions: readonly MetricsRecord["sessions"][number][],
  sessionLabelCounts: Map<string, Record<LabelName, number>>,
): MetricsRecord {
  const turnCount = sessions.reduce(
    (total, session) => total + session.turnCount,
    0,
  );
  const incidentCount = sessions.reduce(
    (total, session) => total + session.incidentCount,
    0,
  );

  return {
    evaluatorVersion: metrics.evaluatorVersion,
    schemaVersion: metrics.schemaVersion,
    generatedAt: metrics.generatedAt,
    sessionCount: sessions.length,
    turnCount,
    incidentCount,
    labelCounts: aggregateLabelCounts(sessions, sessionLabelCounts),
    complianceSummary: aggregateComplianceSummary(sessions),
    sessions: [...sessions],
    inventory: metrics.inventory,
  };
}

export function buildComparativeSlices(
  metrics: MetricsRecord,
  sessionLabelCounts: Map<string, Record<LabelName, number>>,
): SummaryArtifact["comparativeSlices"] {
  const candidateSizes = [100, 500, 1000];
  const slices: ComparativeSlice[] = [];
  const selectedSnapshot = buildScoreSnapshot(metrics);

  slices.push({
    key: "selected_corpus",
    label: "Selected Corpus",
    sessionCount: metrics.sessionCount,
    turnCount: metrics.turnCount,
    incidentCount: metrics.incidentCount,
    proofScore: selectedSnapshot.proofScore,
    flowScore: selectedSnapshot.flowScore,
    disciplineScore: selectedSnapshot.disciplineScore,
    writeVerificationRate: selectedSnapshot.writeVerificationRate,
    incidentsPer100Turns: selectedSnapshot.incidentsPer100Turns,
  });

  for (const size of candidateSizes) {
    if (metrics.sessions.length <= size) {
      continue;
    }

    const sessions = metrics.sessions.slice(-size);
    const subsetMetrics = createSubsetMetrics(
      metrics,
      sessions,
      sessionLabelCounts,
    );
    const snapshot = buildScoreSnapshot(subsetMetrics);

    slices.push({
      key: `recent_${size}`,
      label: `Recent ${size}`,
      sessionCount: subsetMetrics.sessionCount,
      turnCount: subsetMetrics.turnCount,
      incidentCount: subsetMetrics.incidentCount,
      proofScore: snapshot.proofScore,
      flowScore: snapshot.flowScore,
      disciplineScore: snapshot.disciplineScore,
      writeVerificationRate: snapshot.writeVerificationRate,
      incidentsPer100Turns: snapshot.incidentsPer100Turns,
    });
  }

  return slices;
}

function compareTopIncidents(
  left: SummaryArtifact["topIncidents"][number],
  right: SummaryArtifact["topIncidents"][number],
): number {
  const leftLowSignal = left.evidencePreview
    ? isLowSignalPreview(left.evidencePreview)
    : true;
  const rightLowSignal = right.evidencePreview
    ? isLowSignalPreview(right.evidencePreview)
    : true;

  return (
    (severityOrder.get(right.severity) ?? 0) -
      (severityOrder.get(left.severity) ?? 0) ||
    Number(leftLowSignal) - Number(rightLowSignal) ||
    right.turnSpan - left.turnSpan ||
    left.summary.localeCompare(right.summary)
  );
}

function topIncidentDedupKey(
  incident: SummaryArtifact["topIncidents"][number],
): string {
  const normalizedSummary = incident.summary.replace(
    /\s+across\s+\d+\s+turn\(s\)$/i,
    "",
  );
  return `${incident.sessionId}::${normalizedSummary}`;
}

export function insertTopIncident(
  topIncidents: SummaryArtifact["topIncidents"],
  incident: SummaryArtifact["topIncidents"][number],
  limit: number,
): SummaryArtifact["topIncidents"] {
  const deduped = new Map<string, SummaryArtifact["topIncidents"][number]>();

  for (const candidate of [...topIncidents, incident]) {
    const key = topIncidentDedupKey(candidate);
    const existing = deduped.get(key);
    if (!existing || compareTopIncidents(candidate, existing) < 0) {
      deduped.set(key, candidate);
    }
  }

  return [...deduped.values()].sort(compareTopIncidents).slice(0, limit);
}

export function buildSummaryInputsFromArtifacts(
  rawTurns: readonly RawTurnRecord[],
  incidents: readonly IncidentRecord[],
): SummaryInputs {
  const severityCounts = createEmptySeverityCounts();
  let topIncidents: SummaryArtifact["topIncidents"] = [];

  for (const incident of incidents) {
    severityCounts[incident.severity] += 1;
    topIncidents = insertTopIncident(
      topIncidents,
      {
        incidentId: incident.incidentId,
        sessionId: incident.sessionId,
        summary: incident.summary,
        severity: incident.severity,
        confidence: incident.confidence,
        turnSpan: incident.turnIndices.length,
        evidencePreview: incident.evidencePreviews[0],
      },
      8,
    );
  }

  return {
    sessionLabelCounts: collectSessionLabelCounts(rawTurns),
    topIncidents,
    severityCounts,
    writeTurnCount: countWriteTurns(rawTurns),
  };
}

export function buildSummaryCore(
  metrics: MetricsRecord,
  inputs: SummaryInputs,
): SummaryCoreData {
  const sessionsWithWrites = metrics.sessions.filter(
    (session) => session.writeCount > 0,
  );
  const verifiedWriteSessions = sessionsWithWrites.filter(
    (session) => session.verificationPassedCount > 0,
  );
  const topSessions = buildTopSessions(metrics, inputs.sessionLabelCounts);
  const victoryLaps = buildVictoryLaps(topSessions);
  const comparativeSlices = buildComparativeSlices(
    metrics,
    inputs.sessionLabelCounts,
  );

  return {
    labels: labelTaxonomy
      .map((label) => ({
        label,
        count: countLabel(metrics.labelCounts, label),
      }))
      .filter((entry) => entry.count > 0)
      .sort(
        (left, right) =>
          right.count - left.count || left.label.localeCompare(right.label),
      ),
    severities: severityValues.map((severity) => ({
      severity,
      count: inputs.severityCounts[severity],
    })),
    compliance: metrics.complianceSummary,
    rates: {
      incidentsPer100Turns: safeRate(metrics.incidentCount, metrics.turnCount),
      writesPer100Turns: safeRate(inputs.writeTurnCount, metrics.turnCount),
      verificationRequestsPer100Turns: safeRate(
        countLabel(metrics.labelCounts, "verification_request"),
        metrics.turnCount,
      ),
      interruptionsPer100Turns: safeRate(
        countLabel(metrics.labelCounts, "interrupt"),
        metrics.turnCount,
      ),
      reinjectionsPer100Turns: safeRate(
        countLabel(metrics.labelCounts, "context_reinjection"),
        metrics.turnCount,
      ),
      praisePer100Turns: safeRate(
        countLabel(metrics.labelCounts, "praise"),
        metrics.turnCount,
      ),
    },
    delivery: {
      sessionsWithWrites: sessionsWithWrites.length,
      verifiedWriteSessions: verifiedWriteSessions.length,
      writeVerificationRate: safeRate(
        verifiedWriteSessions.length,
        sessionsWithWrites.length,
      ),
    },
    comparativeSlices,
    topSessions: topSessions.slice(0, 8),
    victoryLaps,
    topIncidents: inputs.topIncidents,
  };
}
