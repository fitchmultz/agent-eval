/**
 * Purpose: Assign deterministic per-session attribution from transcript-visible de-templated evidence.
 * Responsibilities: Classify sessions into user_scope, agent_behavior, template_artifact, mixed, or unknown with conservative confidence and reasons.
 * Scope: Runs after template analysis and session processing; never uses hidden state or semantic model inference.
 * Usage: Call `assignSessionAttribution(...)` per processed session, then aggregate with `countAttributions(...)`.
 * Invariants/Assumptions: Unknown and mixed are preferred over over-claiming certainty.
 */

import type { Confidence, LabelCountRecord } from "./schema.js";

export interface SessionTemplateAttributionInput {
  artifactScore: number | null;
  textSharePct: number | null;
  flags: string[];
}

export interface SessionAttribution {
  primary:
    | "user_scope"
    | "agent_behavior"
    | "template_artifact"
    | "mixed"
    | "unknown";
  confidence: Confidence;
  reasons: string[];
}

interface AttributionBuckets {
  user_scope: string[];
  agent_behavior: string[];
  template_artifact: string[];
}

function sumLabelCounts(labelCounts: LabelCountRecord): number {
  return Object.values(labelCounts).reduce<number>(
    (total, count) => total + (typeof count === "number" ? count : 0),
    0,
  );
}

function uniqueReasons(reasons: readonly string[]): string[] {
  return [...new Set(reasons)].slice(0, 3);
}

function buildBuckets(
  rawLabelCounts: LabelCountRecord,
  deTemplatedLabelCounts: LabelCountRecord,
  template: SessionTemplateAttributionInput,
  writeCount: number,
  endedVerified: boolean,
): AttributionBuckets {
  const buckets: AttributionBuckets = {
    user_scope: [],
    agent_behavior: [],
    template_artifact: [],
  };

  const rawSignals = sumLabelCounts(rawLabelCounts);
  const deSignals = sumLabelCounts(deTemplatedLabelCounts);
  if ((template.textSharePct ?? 0) >= 40) {
    buckets.template_artifact.push("High template text share was detected.");
  }
  if (rawSignals > deSignals && rawSignals - deSignals >= 2) {
    buckets.template_artifact.push(
      "Signal counts dropped materially after de-templating.",
    );
  }
  if (template.flags.includes("template_heavy")) {
    buckets.template_artifact.push(
      "The visible transcript surface was scaffold-dominated.",
    );
  }

  if ((deTemplatedLabelCounts.context_drift ?? 0) > 0) {
    buckets.agent_behavior.push("Context drift was reported.");
  }
  if ((deTemplatedLabelCounts.stalled_or_guessing ?? 0) > 0) {
    buckets.agent_behavior.push("Stalled or guessing behavior was reported.");
  }
  if (
    (deTemplatedLabelCounts.regression_report ?? 0) > 0 ||
    (deTemplatedLabelCounts.test_build_lint_failure_complaint ?? 0) > 0
  ) {
    buckets.agent_behavior.push("Regression or breakage was reported.");
  }
  if (writeCount > 0 && !endedVerified) {
    buckets.agent_behavior.push(
      "Write work ended without passing verification.",
    );
  }

  if ((deTemplatedLabelCounts.interrupt ?? 0) > 0) {
    buckets.user_scope.push("User interrupted or redirected the work.");
  }
  if ((deTemplatedLabelCounts.context_reinjection ?? 0) > 0) {
    buckets.user_scope.push("User had to restate scope or constraints.");
  }

  return buckets;
}

export function assignSessionAttribution(input: {
  rawLabelCounts: LabelCountRecord;
  deTemplatedLabelCounts: LabelCountRecord;
  template: SessionTemplateAttributionInput;
  writeCount: number;
  endedVerified: boolean;
}): SessionAttribution {
  const buckets = buildBuckets(
    input.rawLabelCounts,
    input.deTemplatedLabelCounts,
    input.template,
    input.writeCount,
    input.endedVerified,
  );

  const active = (
    [
      ["template_artifact", buckets.template_artifact],
      ["agent_behavior", buckets.agent_behavior],
      ["user_scope", buckets.user_scope],
    ] as const
  ).filter((entry) => entry[1].length > 0);

  if (active.length === 0) {
    return {
      primary: "unknown",
      confidence: "low",
      reasons: ["Transcript-visible evidence was insufficient."],
    };
  }

  if (active.length > 1) {
    return {
      primary: "mixed",
      confidence: "low",
      reasons: uniqueReasons([
        "Multiple cause signals were present.",
        ...active.flatMap((entry) => entry[1]),
      ]),
    };
  }

  const first = active[0];
  if (!first) {
    return {
      primary: "unknown",
      confidence: "low",
      reasons: ["Transcript-visible evidence was insufficient."],
    };
  }

  const [primary, reasons] = first;
  return {
    primary,
    confidence: reasons.length >= 2 ? "high" : "medium",
    reasons: uniqueReasons(reasons),
  };
}

export function countAttributions(
  attributions: readonly SessionAttribution[],
): Record<SessionAttribution["primary"], number> {
  return attributions.reduce(
    (counts, attribution) => {
      counts[attribution.primary] += 1;
      return counts;
    },
    {
      user_scope: 0,
      agent_behavior: 0,
      template_artifact: 0,
      mixed: 0,
      unknown: 0,
    },
  );
}
