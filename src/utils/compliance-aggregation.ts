/**
 * Purpose: Compliance aggregation utilities for building compliance summaries.
 * Entrypoint: `aggregateComplianceSummary()` for aggregating compliance across sessions.
 */

import type {
  ComplianceAggregate,
  ComplianceRuleName,
  ComplianceStatus,
} from "../schema.js";
import { complianceRuleValues } from "../schema.js";

export function createEmptyComplianceSummary(): ComplianceAggregate[] {
  return complianceRuleValues.map((rule) => ({
    rule,
    passCount: 0,
    failCount: 0,
    notApplicableCount: 0,
    unknownCount: 0,
  }));
}

export function incrementComplianceSummary(
  summary: readonly ComplianceAggregate[],
  rule: ComplianceRuleName,
  status: ComplianceStatus,
): ComplianceAggregate[] {
  return summary.map((entry) => {
    if (entry.rule !== rule) {
      return entry;
    }

    if (status === "pass") {
      return { ...entry, passCount: entry.passCount + 1 };
    }
    if (status === "fail") {
      return { ...entry, failCount: entry.failCount + 1 };
    }
    if (status === "not_applicable") {
      return { ...entry, notApplicableCount: entry.notApplicableCount + 1 };
    }

    return { ...entry, unknownCount: entry.unknownCount + 1 };
  });
}

export function aggregateComplianceSummary(
  sessions: Iterable<{
    complianceRules: Iterable<{
      rule: ComplianceRuleName;
      status: ComplianceStatus;
    }>;
  }>,
): ComplianceAggregate[] {
  let summary = createEmptyComplianceSummary();

  for (const session of sessions) {
    for (const rule of session.complianceRules) {
      summary = incrementComplianceSummary(summary, rule.rule, rule.status);
    }
  }

  return summary;
}
