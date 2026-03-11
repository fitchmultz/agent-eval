/**
 * Purpose: Public exports for the calibration benchmark subsystem.
 * Responsibilities: Expose corpus loading, benchmark execution, and report rendering from one stable module.
 * Scope: Used by the CLI command, tests, and any future local automation around calibration.
 * Usage: Import from `src/calibration/index.ts` instead of reaching into individual files.
 * Invariants/Assumptions: Calibration remains a local, deterministic benchmark using synthetic corpus fixtures.
 */

export { loadCalibrationCorpus } from "./corpus.js";
export { renderBenchmarkReport } from "./report.js";
export { runCalibrationBenchmark } from "./runner.js";
export type {
  BenchmarkResults,
  CalibrationCase,
  CalibrationCorpus,
} from "./types.js";
