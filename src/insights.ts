/**
 * Purpose: Computes deterministic evaluation insights, rankings, and derived session archetypes from canonical artifacts.
 * Entrypoint: `buildSummaryArtifact()` is used by the presentation and reporting layers to create compact, decision-useful summaries.
 * Notes: The insight model is intentionally rule-based so results remain reproducible and auditable.
 */
import type {
  IncidentRecord,
  LabelName,
  MetricsRecord,
  RawTurnRecord,
  SessionArchetype,
  Severity,
  SummaryArtifact,
} from "./schema.js";
import { labelTaxonomy, severityValues } from "./schema.js";

export interface SummaryInputs {
  sessionLabelCounts: Map<string, Record<LabelName, number>>;
  topIncidents: SummaryArtifact["topIncidents"];
  severityCounts: Record<Severity, number>;
  writeTurnCount: number;
}

interface SessionInsightRow {
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

function buildTopSessions(
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

function buildInsightCards(
  metrics: MetricsRecord,
  topSessions: readonly SessionInsightRow[],
): SummaryArtifact["insightCards"] {
  const sessionsWithWrites = metrics.sessions.filter(
    (session) => session.writeCount > 0,
  );
  const verifiedWriteSessions = sessionsWithWrites.filter(
    (session) => session.verificationPassedCount > 0,
  );
  const highestFriction = topSessions[0];
  const interruptionRate = safeRate(
    countLabel(metrics.labelCounts, "interrupt"),
    metrics.turnCount,
  );

  return [
    {
      title: "Write Verification",
      value: `${verifiedWriteSessions.length}/${sessionsWithWrites.length}`,
      detail:
        sessionsWithWrites.length > 0
          ? `${safeRate(verifiedWriteSessions.length, sessionsWithWrites.length)}% of write sessions ended with a passing verification signal.`
          : "No write sessions were observed.",
      tone:
        sessionsWithWrites.length === 0
          ? "neutral"
          : verifiedWriteSessions.length === sessionsWithWrites.length
            ? "good"
            : "warn",
    },
    {
      title: "Interruption Load",
      value: `${interruptionRate}`,
      detail:
        "Interrupt labels per 100 turns, useful for spotting redirected or churn-heavy sessions.",
      tone: interruptionRate >= 10 ? "warn" : "neutral",
    },
    {
      title: "Highest Friction Session",
      value: highestFriction ? highestFriction.sessionId : "none",
      detail: highestFriction
        ? `${highestFriction.frictionScore} friction points, archetype ${highestFriction.archetype}.`
        : "No sessions were available.",
      tone:
        highestFriction && highestFriction.frictionScore >= 8
          ? "danger"
          : "neutral",
    },
  ];
}

function buildBragCards(
  metrics: MetricsRecord,
  topSessions: readonly SessionInsightRow[],
): SummaryArtifact["bragCards"] {
  const sessionsWithWrites = metrics.sessions.filter(
    (session) => session.writeCount > 0,
  );
  const verifiedWriteSessions = sessionsWithWrites.filter(
    (session) => session.verificationPassedCount > 0,
  );
  const bestRecovery = topSessions.find(
    (session) => session.archetype === "high_friction_recovery",
  );

  return [
    {
      title: "Proof-Backed Ships",
      value: `${verifiedWriteSessions.length}`,
      detail:
        "Sessions that ended with both code changes and a passing verification signal.",
      tone: verifiedWriteSessions.length > 0 ? "good" : "neutral",
    },
    {
      title: "Battle-Tested Runs",
      value: `${metrics.sessionCount}`,
      detail: "Sessions included in this deterministic corpus slice.",
      tone: metrics.sessionCount >= 1000 ? "good" : "neutral",
    },
    {
      title: "Hero Recovery",
      value: bestRecovery ? bestRecovery.sessionId : "none",
      detail: bestRecovery
        ? `${bestRecovery.archetypeLabel} with friction ${bestRecovery.frictionScore}.`
        : "No recovery-style write sessions were detected.",
      tone: bestRecovery ? "warn" : "neutral",
    },
  ];
}

function buildAchievementBadges(
  metrics: MetricsRecord,
  topSessions: readonly SessionInsightRow[],
): string[] {
  const badges: string[] = [];
  const sessionsWithWrites = metrics.sessions.filter(
    (session) => session.writeCount > 0,
  );
  const verifiedWriteSessions = sessionsWithWrites.filter(
    (session) => session.verificationPassedCount > 0,
  );
  const verificationRate = safeRate(
    verifiedWriteSessions.length,
    sessionsWithWrites.length,
  );
  const interruptionRate = safeRate(
    countLabel(metrics.labelCounts, "interrupt"),
    metrics.turnCount,
  );
  const driftSignals = countLabel(metrics.labelCounts, "context_drift");

  if (metrics.sessionCount >= 1000) {
    badges.push("Battle-Tested Corpus");
  }
  if (verificationRate >= 90) {
    badges.push("Proof-Backed Builder");
  }
  if (interruptionRate <= 2) {
    badges.push("Low-Drama Operator");
  }
  if (driftSignals === 0) {
    badges.push("Zero Drift Complaints");
  }
  if (
    topSessions.some(
      (session) => session.archetype === "high_friction_recovery",
    )
  ) {
    badges.push("Recovery Specialist");
  }

  return badges;
}

function buildOpportunities(
  metrics: MetricsRecord,
  topSessions: readonly SessionInsightRow[],
): SummaryArtifact["opportunities"] {
  const opportunities: SummaryArtifact["opportunities"] = [];
  const verificationDemand = safeRate(
    countLabel(metrics.labelCounts, "verification_request"),
    metrics.turnCount,
  );
  const reinjectionDemand = safeRate(
    countLabel(metrics.labelCounts, "context_reinjection"),
    metrics.turnCount,
  );
  const driftSignals = countLabel(metrics.labelCounts, "context_drift");

  if (verificationDemand >= 15) {
    opportunities.push({
      title: "Reduce verification prompting burden",
      rationale:
        "Users are frequently asking for verification explicitly. Consider stronger default post-change verification behavior or more visible verification status updates.",
    });
  }

  if (reinjectionDemand >= 8) {
    opportunities.push({
      title: "Improve context retention",
      rationale:
        "Repeated goal or constraint restatement suggests sessions may need better plan persistence or clearer progress anchors.",
    });
  }

  if (driftSignals > 0) {
    opportunities.push({
      title: "Guard against scope drift",
      rationale:
        "At least one session included an explicit context drift complaint. This is a strong candidate for turn-level reminders and tighter write gating.",
    });
  }

  if (
    topSessions.some((session) => session.archetype === "unverified_delivery")
  ) {
    opportunities.push({
      title: "Block unverified deliveries",
      rationale:
        "Some write sessions ended without a passing verification signal. The evaluator should keep emphasizing this as a policy breach, not just a metric.",
    });
  }

  return opportunities.slice(0, 5);
}

function compareTopIncidents(
  left: SummaryArtifact["topIncidents"][number],
  right: SummaryArtifact["topIncidents"][number],
): number {
  return (
    (severityOrder.get(right.severity) ?? 0) -
      (severityOrder.get(left.severity) ?? 0) ||
    right.turnSpan - left.turnSpan ||
    left.summary.localeCompare(right.summary)
  );
}

export function insertTopIncident(
  topIncidents: SummaryArtifact["topIncidents"],
  incident: SummaryArtifact["topIncidents"][number],
  limit: number,
): SummaryArtifact["topIncidents"] {
  return [...topIncidents, incident].sort(compareTopIncidents).slice(0, limit);
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

export function buildSummaryArtifact(
  metrics: MetricsRecord,
  inputs: SummaryInputs,
): SummaryArtifact {
  const sessionsWithWrites = metrics.sessions.filter(
    (session) => session.writeCount > 0,
  );
  const verifiedWriteSessions = sessionsWithWrites.filter(
    (session) => session.verificationPassedCount > 0,
  );
  const topSessions = buildTopSessions(metrics, inputs.sessionLabelCounts);

  return {
    evaluatorVersion: metrics.evaluatorVersion,
    schemaVersion: metrics.schemaVersion,
    generatedAt: metrics.generatedAt,
    sessions: metrics.sessionCount,
    turns: metrics.turnCount,
    incidents: metrics.incidentCount,
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
    bragCards: buildBragCards(metrics, topSessions),
    achievementBadges: buildAchievementBadges(metrics, topSessions),
    insightCards: buildInsightCards(metrics, topSessions),
    topSessions: topSessions.slice(0, 8),
    opportunities: buildOpportunities(metrics, topSessions),
    topIncidents: inputs.topIncidents,
  };
}
