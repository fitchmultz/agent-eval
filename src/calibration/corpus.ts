/**
 * Purpose: Load and resolve the synthetic calibration corpus against on-disk transcript fixtures.
 * Responsibilities: Validate corpus metadata and convert relative fixture references to absolute paths.
 * Scope: Shared corpus-loading layer for benchmark execution and tests.
 * Usage: Call `loadCalibrationCorpus()` before running the calibration benchmark.
 * Invariants/Assumptions: All fixtures live under `src/calibration/fixtures` and remain deterministic.
 */

import { fileURLToPath } from "node:url";
import corpusJson from "./corpus.json" with { type: "json" };
import {
  type CalibrationCase,
  type CalibrationCorpus,
  calibrationCorpusSchema,
} from "./types.js";

export interface ResolvedCalibrationCase extends CalibrationCase {
  fixturePath: string;
}

export function loadCalibrationCorpus(): ResolvedCalibrationCase[] {
  const corpus = calibrationCorpusSchema.parse(corpusJson) as CalibrationCorpus;
  return corpus.map((testCase) => ({
    ...testCase,
    fixturePath: fileURLToPath(
      new URL(`./fixtures/${testCase.fixture}`, import.meta.url),
    ),
  }));
}
