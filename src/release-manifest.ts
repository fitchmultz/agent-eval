/**
 * Purpose: Builds a public-safe release manifest for generated artifact bundles.
 * Responsibilities: Capture repo revision metadata, config fingerprints, evaluation parameters, and emitted artifact inventory.
 * Scope: Shared by evaluator and artifact writer; complements metrics/summary/session-facts without altering their canonical schemas.
 * Usage: Call `buildReleaseManifest(...)` during evaluation and serialize the result alongside other generated artifacts.
 * Invariants/Assumptions: Home paths and other local-only inputs must not be emitted directly; unavailable git metadata degrades to null.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { z } from "zod";

import { getConfig } from "./config/index.js";
import type { EvaluateOptions } from "./evaluator.js";
import {
  type MetricsRecord,
  metricsSchema,
  type SessionFactRecord,
  type SummaryArtifact,
  sourceProviderValues,
  timeBucketValues,
} from "./schema.js";
import { SCHEMA_VERSION } from "./version.js";

export const releaseManifestSchema = z
  .object({
    engineVersion: z.string().min(1),
    schemaVersion: z.literal(SCHEMA_VERSION),
    generatedAt: z.string().min(1),
    git: z
      .object({
        commit: z.string().min(1).nullable(),
        branch: z.string().min(1).nullable(),
        dirty: z.boolean().nullable(),
      })
      .strict(),
    configFingerprint: z.string().length(16),
    evaluation: z
      .object({
        source: z.enum(sourceProviderValues),
        outputMode: z.enum(["summary", "full"]),
        sessionLimit: z.int().positive().nullable(),
        startDate: z.string().min(1).nullable(),
        endDate: z.string().min(1).nullable(),
        timeBucket: z.enum(timeBucketValues),
        parseTimeoutMs: z.int().positive().nullable(),
      })
      .strict(),
    corpusScope: metricsSchema.shape.corpusScope,
    appliedFilters: metricsSchema.shape.appliedFilters,
    counts: z
      .object({
        sessions: z.int().nonnegative(),
        turns: z.int().nonnegative(),
        incidents: z.int().nonnegative(),
        sessionFacts: z.int().nonnegative(),
        exemplarSessions: z.int().nonnegative(),
        reviewQueueSessions: z.int().nonnegative(),
      })
      .strict(),
    artifactFiles: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;

export interface ReleaseConfigFingerprintInput {
  evaluation: ReleaseManifest["evaluation"];
  corpusScope: MetricsRecord["corpusScope"];
  appliedFilters: MetricsRecord["appliedFilters"];
}

function readGitValue(args: string[]): string | null {
  try {
    const output = execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

function readGitDirtyState(): boolean | null {
  try {
    const output = execFileSync("git", ["status", "--porcelain"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return output.length > 0;
  } catch {
    return null;
  }
}

export function computeReleaseConfigFingerprint(
  input: ReleaseConfigFingerprintInput,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        config: getConfig(),
        evaluation: input.evaluation,
        corpusScope: input.corpusScope,
        appliedFilters: input.appliedFilters,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

export function buildReleaseManifest(
  metrics: MetricsRecord,
  summary: SummaryArtifact,
  sessionFacts: readonly SessionFactRecord[],
  options: EvaluateOptions,
  artifactFiles: readonly string[],
): ReleaseManifest {
  return {
    engineVersion: metrics.engineVersion,
    schemaVersion: metrics.schemaVersion,
    generatedAt: metrics.generatedAt,
    git: {
      commit: readGitValue(["rev-parse", "HEAD"]),
      branch: readGitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
      dirty: readGitDirtyState(),
    },
    configFingerprint: computeReleaseConfigFingerprint({
      evaluation: {
        source: options.source,
        outputMode: options.outputMode ?? "full",
        sessionLimit: options.sessionLimit ?? null,
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
        timeBucket: options.timeBucket ?? "week",
        parseTimeoutMs: options.parseTimeoutMs ?? null,
      },
      corpusScope: metrics.corpusScope,
      appliedFilters: metrics.appliedFilters,
    }),
    evaluation: {
      source: options.source,
      outputMode: options.outputMode ?? "full",
      sessionLimit: options.sessionLimit ?? null,
      startDate: options.startDate ?? null,
      endDate: options.endDate ?? null,
      timeBucket: options.timeBucket ?? "week",
      parseTimeoutMs: options.parseTimeoutMs ?? null,
    },
    corpusScope: metrics.corpusScope,
    appliedFilters: metrics.appliedFilters,
    counts: {
      sessions: metrics.sessionCount,
      turns: metrics.turnCount,
      incidents: metrics.incidentCount,
      sessionFacts: sessionFacts.length,
      exemplarSessions: summary.exemplarSessions.length,
      reviewQueueSessions: summary.reviewQueue.length,
    },
    artifactFiles: [...artifactFiles],
  };
}
