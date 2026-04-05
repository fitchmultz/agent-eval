/**
 * Purpose: Builds deterministic comparative slices for the v3 summary contract.
 * Entrypoint: Used by summary generation to provide static comparison tables without client-side filtering.
 * Notes: Slices are derived from canonical session records rather than surfaced exemplar/review lists.
 */

import type { MetricsRecord, SummaryArtifact } from "./schema.js";
import { safeRate } from "./summary/index.js";
import type { SummarySessionRecord } from "./summary/types.js";

function buildSlice(
  key: string,
  label: string,
  kind: SummaryArtifact["comparativeSlices"][number]["kind"],
  records: readonly SummarySessionRecord[],
  filters: SummaryArtifact["comparativeSlices"][number]["filters"] = [],
  notes: SummaryArtifact["comparativeSlices"][number]["notes"] = [],
): SummaryArtifact["comparativeSlices"][number] {
  const sessionCount = records.length;
  const turnCount = records.reduce(
    (sum, record) => sum + record.metrics.turnCount,
    0,
  );
  const incidentCount = records.reduce(
    (sum, record) => sum + record.metrics.incidentCount,
    0,
  );
  const writeSessionCount = records.filter(
    (record) => record.metrics.writeCount > 0,
  ).length;
  const endedVerifiedCount = records.filter(
    (record) => record.metrics.writeCount > 0 && record.metrics.endedVerified,
  ).length;
  const endedUnverifiedCount = Math.max(
    0,
    writeSessionCount - endedVerifiedCount,
  );
  const interruptCount = records.reduce(
    (sum, record) => sum + (record.labels.interrupt ?? 0),
    0,
  );

  return {
    key,
    label,
    kind,
    filters,
    metrics: {
      sessionCount,
      turnCount,
      incidentCount,
      writeSessionCount,
      endedVerifiedCount,
      endedUnverifiedCount,
      incidentsPer100Turns:
        turnCount > 0 ? safeRate(incidentCount, turnCount) : null,
      interruptRatePer100Turns:
        turnCount > 0 ? safeRate(interruptCount, turnCount) : null,
    },
    notes,
  };
}

function latestSelectedTimestamp(
  metrics: MetricsRecord,
  records: readonly SummarySessionRecord[],
): number | null {
  if (metrics.appliedFilters.endDate) {
    return Date.parse(`${metrics.appliedFilters.endDate}T23:59:59.999Z`);
  }

  const values = records
    .map((record) => record.metrics.startedAt)
    .filter((value): value is string => typeof value === "string")
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));

  return values.length > 0 ? Math.max(...values) : null;
}

function recordsWithinDays(
  records: readonly SummarySessionRecord[],
  anchorTime: number,
  days: number,
): SummarySessionRecord[] {
  const lowerBound = anchorTime - (days - 1) * 24 * 60 * 60 * 1000;

  return records.filter((record) => {
    if (!record.metrics.startedAt) {
      return false;
    }

    const startedAt = Date.parse(record.metrics.startedAt);
    return (
      Number.isFinite(startedAt) &&
      startedAt >= lowerBound &&
      startedAt <= anchorTime
    );
  });
}

function isHighTemplate(record: SummarySessionRecord): boolean {
  return (
    record.template.flags.includes("template_heavy") ||
    (record.template.textSharePct ?? 0) >= 40
  );
}

function isLowTemplate(record: SummarySessionRecord): boolean {
  return !isHighTemplate(record) && (record.template.textSharePct ?? 0) < 20;
}

/**
 * Builds static comparative slices for the selected corpus.
 */
export function buildComparativeSlices(
  metrics: MetricsRecord,
  records: readonly SummarySessionRecord[],
): SummaryArtifact["comparativeSlices"] {
  const slices: SummaryArtifact["comparativeSlices"] = [
    buildSlice(
      "selected_corpus",
      "Selected Corpus",
      "selected_corpus",
      records,
      [],
      [
        {
          code: "comparative_slice_scope",
          level: "info",
          message:
            "Comparative slices are computed from canonical session facts rather than from surfaced exemplar or review rows.",
        },
      ],
    ),
  ];

  const anchorTime = latestSelectedTimestamp(metrics, records);
  if (anchorTime !== null) {
    for (const days of [7, 30, 90] as const) {
      const windowRecords = recordsWithinDays(records, anchorTime, days);
      if (windowRecords.length === 0) {
        continue;
      }

      slices.push(
        buildSlice(
          `time_window_last_${days}_days`,
          `Last ${days} Days`,
          "time_window",
          windowRecords,
          [
            {
              key: "time_window",
              label: "Time Window",
              value: `last_${days}_days`,
            },
          ],
        ),
      );
    }
  }

  const providerGroups = new Map<string, SummarySessionRecord[]>();
  for (const record of records) {
    const sessions = providerGroups.get(record.metrics.provider) ?? [];
    sessions.push(record);
    providerGroups.set(record.metrics.provider, sessions);
  }

  for (const [provider, providerRecords] of [
    ...providerGroups.entries(),
  ].sort()) {
    slices.push(
      buildSlice(
        `provider_${provider}`,
        provider,
        "provider",
        providerRecords,
        [
          {
            key: "provider",
            label: "Provider",
            value: provider,
          },
        ],
      ),
    );
  }

  const harnessGroups = new Map<string, SummarySessionRecord[]>();
  for (const record of records) {
    if (!record.metrics.harness) {
      continue;
    }

    const sessions = harnessGroups.get(record.metrics.harness) ?? [];
    sessions.push(record);
    harnessGroups.set(record.metrics.harness, sessions);
  }

  for (const [harness, harnessRecords] of [...harnessGroups.entries()].sort()) {
    slices.push(
      buildSlice(`harness_${harness}`, harness, "harness", harnessRecords, [
        {
          key: "harness",
          label: "Harness",
          value: harness,
        },
      ]),
    );
  }

  const writeSessions = records.filter(
    (record) => record.metrics.writeCount > 0,
  );
  const analysisOnlySessions = records.filter(
    (record) => record.metrics.writeCount === 0,
  );

  if (writeSessions.length > 0) {
    slices.push(
      buildSlice(
        "workload_write_sessions",
        "Write Sessions",
        "workload",
        writeSessions,
        [
          {
            key: "workload",
            label: "Workload",
            value: "write_sessions",
          },
        ],
      ),
    );
  }

  if (analysisOnlySessions.length > 0) {
    slices.push(
      buildSlice(
        "workload_analysis_only",
        "Analysis Only",
        "workload",
        analysisOnlySessions,
        [
          {
            key: "workload",
            label: "Workload",
            value: "analysis_only",
          },
        ],
      ),
    );
  }

  const highTemplateRecords = records.filter(isHighTemplate);
  const lowTemplateRecords = records.filter(isLowTemplate);

  if (highTemplateRecords.length > 0) {
    slices.push(
      buildSlice(
        "template_band_high_template",
        "High Template",
        "template_band",
        highTemplateRecords,
        [
          {
            key: "template_band",
            label: "Template Band",
            value: "high_template",
          },
        ],
      ),
    );
  }

  if (lowTemplateRecords.length > 0) {
    slices.push(
      buildSlice(
        "template_band_low_template",
        "Low Template",
        "template_band",
        lowTemplateRecords,
        [
          {
            key: "template_band",
            label: "Template Band",
            value: "low_template",
          },
        ],
      ),
    );
  }

  return slices;
}
