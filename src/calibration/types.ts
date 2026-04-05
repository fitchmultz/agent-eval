/**
 * Purpose: Define schemas and types for the synthetic calibration corpus and benchmark results.
 * Responsibilities: Validate corpus cases, benchmark outputs, case-scoped matching metrics, surfaced-session expectations, attribution expectations, and sanitization expectations.
 * Scope: Shared by the calibration runner, report renderer, CLI command, and tests.
 * Usage: Import these types from the calibration package instead of redefining benchmark contracts.
 * Invariants/Assumptions: Calibration corpus remains synthetic, deterministic, and provider-specific without external dependencies.
 */

import { z } from "zod";
import { attributionPrimaryValues, labelTaxonomy } from "../schema.js";

const calibrationProviderSchema = z.enum(["codex", "claude", "pi"]);

export const labelInstanceSchema = z.object({
  turnIndex: z.int().nonnegative(),
  label: z.enum(labelTaxonomy),
});

export const labelBenchmarkRecordSchema = z.object({
  label: z.enum(labelTaxonomy),
  expectedCount: z.int().nonnegative(),
  actualCount: z.int().nonnegative(),
  truePositive: z.int().nonnegative(),
  falsePositive: z.int().nonnegative(),
  falseNegative: z.int().nonnegative(),
  precision: z.number(),
  recall: z.number(),
});

export const sanitizationCheckSchema = z.object({
  input: z.string(),
  mustContain: z.array(z.string()).default([]),
  mustNotContain: z.array(z.string()).default([]),
});

export const expectedIncidentSchema = z.object({
  turnIndices: z.array(z.int().nonnegative()).min(1),
  labels: z.array(z.enum(labelTaxonomy)).min(1),
});

export const terminalVerificationExpectationSchema = z.object({
  postWriteVerificationAttempted: z.boolean(),
  postWriteVerificationPassed: z.boolean(),
  endedVerified: z.boolean(),
});

export const surfacedExpectationSchema = z.object({
  exemplar: z.boolean(),
  reviewQueue: z.boolean(),
});

export const parseWarningExpectationSchema = z.object({
  expectedCount: z.int().nonnegative(),
  actualCount: z.int().nonnegative(),
  passed: z.boolean(),
});

export const incidentBenchmarkRecordSchema = z.object({
  expectedCount: z.int().nonnegative(),
  actualCount: z.int().nonnegative(),
  matchedCount: z.int().nonnegative(),
  precision: z.number(),
  recall: z.number(),
});

export const calibrationCaseSchema = z.object({
  id: z.string().min(1),
  provider: calibrationProviderSchema,
  fixture: z.string().min(1),
  expectedLabelInstances: z.array(labelInstanceSchema).default([]),
  expectedIncidents: z.array(expectedIncidentSchema).default([]),
  expectedTerminalVerification: terminalVerificationExpectationSchema,
  expectedAttribution: z.enum(attributionPrimaryValues).optional(),
  expectedSurfacedIn: surfacedExpectationSchema.optional(),
  expectedParseWarningCount: z.int().nonnegative().default(0),
  sanitizationChecks: z.array(sanitizationCheckSchema).default([]),
});

export const calibrationCorpusSchema = z.array(calibrationCaseSchema);

export const sanitizationCheckResultSchema = z.object({
  checkId: z.string(),
  passed: z.boolean(),
  mustContainMisses: z.array(z.string()),
  mustNotContainViolations: z.array(z.string()),
});

export const calibrationCaseResultSchema = z.object({
  id: z.string(),
  provider: calibrationProviderSchema,
  fixture: z.string(),
  parseWarnings: parseWarningExpectationSchema,
  expectedLabelInstances: z.array(labelInstanceSchema),
  actualLabelInstances: z.array(labelInstanceSchema),
  labelMetrics: z.array(labelBenchmarkRecordSchema),
  expectedIncidents: z.array(expectedIncidentSchema),
  actualIncidents: z.array(expectedIncidentSchema),
  incidentMetrics: incidentBenchmarkRecordSchema,
  expectedTerminalVerification: terminalVerificationExpectationSchema,
  actualTerminalVerification: terminalVerificationExpectationSchema,
  expectedAttribution: z.enum(attributionPrimaryValues).nullable(),
  actualAttribution: z.enum(attributionPrimaryValues),
  expectedSurfacedIn: surfacedExpectationSchema.nullable(),
  actualSurfacedIn: surfacedExpectationSchema,
  sanitizationChecks: z.array(sanitizationCheckResultSchema),
});

export const benchmarkResultsSchema = z.object({
  benchmarkVersion: z.string(),
  engineVersion: z.string(),
  schemaVersion: z.string(),
  caseCount: z.int().nonnegative(),
  labelMetrics: z.array(labelBenchmarkRecordSchema),
  incidentMetrics: incidentBenchmarkRecordSchema,
  terminalVerificationMetrics: z.object({
    caseCount: z.int().nonnegative(),
    endedVerifiedAccuracy: z.number(),
    postWriteVerificationAttemptedAccuracy: z.number(),
    postWriteVerificationPassedAccuracy: z.number(),
  }),
  attributionMetrics: z.object({
    caseCount: z.int().nonnegative(),
    expectedCaseCount: z.int().nonnegative(),
    matchedCaseCount: z.int().nonnegative(),
    accuracy: z.number(),
  }),
  surfacedMetrics: z.object({
    caseCount: z.int().nonnegative(),
    expectedCaseCount: z.int().nonnegative(),
    matchedCaseCount: z.int().nonnegative(),
    accuracy: z.number(),
  }),
  parseWarningMetrics: z.object({
    caseCount: z.int().nonnegative(),
    expectedCount: z.int().nonnegative(),
    actualCount: z.int().nonnegative(),
    matchedCaseCount: z.int().nonnegative(),
    accuracy: z.number(),
  }),
  sanitizationMetrics: z.object({
    checkCount: z.int().nonnegative(),
    passedCount: z.int().nonnegative(),
    falsePositiveExamples: z.array(z.string()),
    falseNegativeExamples: z.array(z.string()),
  }),
  cases: z.array(calibrationCaseResultSchema),
});

export type CalibrationCase = z.infer<typeof calibrationCaseSchema>;
export type CalibrationCorpus = z.infer<typeof calibrationCorpusSchema>;
export type CalibrationCaseResult = z.infer<typeof calibrationCaseResultSchema>;
export type BenchmarkResults = z.infer<typeof benchmarkResultsSchema>;
