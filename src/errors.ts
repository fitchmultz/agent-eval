/**
 * Purpose: Provides typed error classes and error handling utilities for the evaluator.
 * Entrypoint: Imported by CLI, transcript parser, and filesystem modules.
 * Notes: All evaluator errors extend EvaluatorError for consistent error handling.
 */

/**
 * Minimal interface for errors with a code property.
 * Used for safe type narrowing of system errors like ENOENT, EACCES.
 */
interface ErrorWithCode {
  code: string;
  path?: string;
}

/**
 * Type guard to check if an unknown value is an error with a code property.
 * @param error - The unknown value to check
 * @returns True if the value is an object with a string code property
 */
function hasErrorCode(error: unknown): error is ErrorWithCode {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as Record<string, unknown>)["code"] === "string"
  );
}

/**
 * Safely normalizes an unknown error value to an Error instance.
 * @param error - The unknown error value
 * @returns An Error instance (either the original or a wrapped error)
 */
export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

/**
 * Base error class for all evaluator errors.
 * Provides error code and exit code for CLI handling.
 */
export class EvaluatorError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly exitCode: number = 1,
  ) {
    super(message);
    this.name = "EvaluatorError";
  }
}

/**
 * Error for validation failures (invalid input, bad options, etc.).
 * Exit code: 2 (usage error)
 */
export class ValidationError extends EvaluatorError {
  override name = "ValidationError";
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 2);
  }
}

/**
 * Error for file not found scenarios.
 * Exit code: 1 (runtime failure)
 */
export class FileNotFoundError extends EvaluatorError {
  override name = "FileNotFoundError";
  constructor(path: string) {
    super(`File or directory not found: ${path}`, "FILE_NOT_FOUND", 1);
  }
}

/**
 * Error for permission denied scenarios.
 * Exit code: 1 (runtime failure)
 */
export class PermissionDeniedError extends EvaluatorError {
  override name = "PermissionDeniedError";
  constructor(path: string) {
    super(`Permission denied: ${path}`, "PERMISSION_DENIED", 1);
  }
}

/**
 * Error for transcript parsing failures.
 * Exit code: 1 (runtime failure)
 */
export class TranscriptParseError extends EvaluatorError {
  override name = "TranscriptParseError";
  constructor(
    public readonly path: string,
    public readonly lineNumber: number,
    public override readonly cause: Error,
  ) {
    super(
      `Failed to parse transcript at ${path}:${lineNumber}: ${cause.message}`,
      "TRANSCRIPT_PARSE_ERROR",
      1,
    );
  }
}

/**
 * Error for invalid transcript format/structure.
 * Exit code: 1 (runtime failure)
 */
export class TranscriptFormatError extends EvaluatorError {
  override name = "TranscriptFormatError";
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(
      `Invalid transcript format at ${path}: ${message}`,
      "TRANSCRIPT_FORMAT_ERROR",
      1,
    );
  }
}

/**
 * Type guard to check if an error is an ENOENT error.
 * Used to distinguish "file not found" from other filesystem errors.
 */
export function isEnoentError(error: unknown): error is ErrorWithCode {
  return hasErrorCode(error) && error.code === "ENOENT";
}

/**
 * Type guard to check if an error is an EACCES/EPERM (permission) error.
 */
export function isPermissionError(error: unknown): error is ErrorWithCode {
  return (
    hasErrorCode(error) && (error.code === "EACCES" || error.code === "EPERM")
  );
}

/**
 * Type guard to check if an error is an EvaluatorError.
 */
export function isEvaluatorError(error: unknown): error is EvaluatorError {
  return error instanceof EvaluatorError;
}

/**
 * Converts an unknown error to a string message safely.
 */
export function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Get the appropriate exit code for an error.
 * Returns 1 for generic errors, or the error's exit code if it's an EvaluatorError.
 */
export function getExitCode(error: unknown): number {
  if (error instanceof EvaluatorError) {
    return error.exitCode;
  }
  return 1;
}
