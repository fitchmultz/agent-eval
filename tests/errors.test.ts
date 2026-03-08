/**
 * Purpose: Tests for typed error classes and error handling utilities.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Covers all error types and utility functions.
 */
import { describe, expect, it } from "vitest";

import {
  EvaluatorError,
  errorToMessage,
  FileNotFoundError,
  getExitCode,
  isEnoentError,
  isEvaluatorError,
  isPermissionError,
  PermissionDeniedError,
  TranscriptFormatError,
  TranscriptParseError,
  ValidationError,
} from "../src/errors.js";

describe("errors", () => {
  describe("EvaluatorError", () => {
    it("creates base error with default exit code", () => {
      const error = new EvaluatorError("Something went wrong", "TEST_ERROR");
      expect(error.message).toBe("Something went wrong");
      expect(error.code).toBe("TEST_ERROR");
      expect(error.exitCode).toBe(1);
      expect(error.name).toBe("EvaluatorError");
    });

    it("creates base error with custom exit code", () => {
      const error = new EvaluatorError("Custom error", "CUSTOM_ERROR", 42);
      expect(error.exitCode).toBe(42);
    });
  });

  describe("ValidationError", () => {
    it("creates validation error with correct properties", () => {
      const error = new ValidationError("Invalid input");
      expect(error.message).toBe("Invalid input");
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.exitCode).toBe(2);
      expect(error.name).toBe("ValidationError");
    });

    it("is instance of EvaluatorError", () => {
      const error = new ValidationError("Test");
      expect(error).toBeInstanceOf(EvaluatorError);
    });
  });

  describe("FileNotFoundError", () => {
    it("creates file not found error with path", () => {
      const error = new FileNotFoundError("/path/to/file.txt");
      expect(error.message).toBe(
        "File or directory not found: /path/to/file.txt",
      );
      expect(error.code).toBe("FILE_NOT_FOUND");
      expect(error.exitCode).toBe(1);
      expect(error.name).toBe("FileNotFoundError");
    });

    it("is instance of EvaluatorError", () => {
      const error = new FileNotFoundError("/test");
      expect(error).toBeInstanceOf(EvaluatorError);
    });
  });

  describe("PermissionDeniedError", () => {
    it("creates permission denied error with path", () => {
      const error = new PermissionDeniedError("/root/secret.txt");
      expect(error.message).toBe("Permission denied: /root/secret.txt");
      expect(error.code).toBe("PERMISSION_DENIED");
      expect(error.exitCode).toBe(1);
      expect(error.name).toBe("PermissionDeniedError");
    });

    it("is instance of EvaluatorError", () => {
      const error = new PermissionDeniedError("/test");
      expect(error).toBeInstanceOf(EvaluatorError);
    });
  });

  describe("TranscriptParseError", () => {
    it("creates parse error with path, line number, and cause", () => {
      const cause = new Error("Unexpected token");
      const error = new TranscriptParseError(
        "/path/to/transcript.jsonl",
        42,
        cause,
      );

      expect(error.message).toBe(
        "Failed to parse transcript at /path/to/transcript.jsonl:42: Unexpected token",
      );
      expect(error.code).toBe("TRANSCRIPT_PARSE_ERROR");
      expect(error.exitCode).toBe(1);
      expect(error.name).toBe("TranscriptParseError");
      expect(error.path).toBe("/path/to/transcript.jsonl");
      expect(error.lineNumber).toBe(42);
      expect(error.cause).toBe(cause);
    });

    it("is instance of EvaluatorError", () => {
      const error = new TranscriptParseError("/test", 1, new Error("cause"));
      expect(error).toBeInstanceOf(EvaluatorError);
    });
  });

  describe("TranscriptFormatError", () => {
    it("creates format error with path and message", () => {
      const error = new TranscriptFormatError(
        "/path/to/transcript.jsonl",
        "Missing session_id",
      );

      expect(error.message).toBe(
        "Invalid transcript format at /path/to/transcript.jsonl: Missing session_id",
      );
      expect(error.code).toBe("TRANSCRIPT_FORMAT_ERROR");
      expect(error.exitCode).toBe(1);
      expect(error.name).toBe("TranscriptFormatError");
      expect(error.path).toBe("/path/to/transcript.jsonl");
    });

    it("is instance of EvaluatorError", () => {
      const error = new TranscriptFormatError("/test", "test");
      expect(error).toBeInstanceOf(EvaluatorError);
    });
  });

  describe("isEnoentError", () => {
    it("returns true for ENOENT errors", () => {
      const error = Object.assign(new Error("File not found"), {
        code: "ENOENT",
      });
      expect(isEnoentError(error)).toBe(true);
    });

    it("returns false for other error codes", () => {
      const error = Object.assign(new Error("Permission denied"), {
        code: "EACCES",
      });
      expect(isEnoentError(error)).toBe(false);
    });

    it("returns false for non-objects", () => {
      expect(isEnoentError(null)).toBe(false);
      expect(isEnoentError(undefined)).toBe(false);
      expect(isEnoentError("string")).toBe(false);
      expect(isEnoentError(123)).toBe(false);
    });

    it("returns false for objects without code property", () => {
      expect(isEnoentError(new Error("test"))).toBe(false);
      expect(isEnoentError({})).toBe(false);
    });
  });

  describe("isPermissionError", () => {
    it("returns true for EACCES errors", () => {
      const error = Object.assign(new Error("Permission denied"), {
        code: "EACCES",
      });
      expect(isPermissionError(error)).toBe(true);
    });

    it("returns true for EPERM errors", () => {
      const error = Object.assign(new Error("Operation not permitted"), {
        code: "EPERM",
      });
      expect(isPermissionError(error)).toBe(true);
    });

    it("returns false for ENOENT errors", () => {
      const error = Object.assign(new Error("File not found"), {
        code: "ENOENT",
      });
      expect(isPermissionError(error)).toBe(false);
    });

    it("returns false for non-objects", () => {
      expect(isPermissionError(null)).toBe(false);
      expect(isPermissionError(undefined)).toBe(false);
    });
  });

  describe("isEvaluatorError", () => {
    it("returns true for EvaluatorError instances", () => {
      expect(isEvaluatorError(new EvaluatorError("test", "TEST"))).toBe(true);
      expect(isEvaluatorError(new ValidationError("test"))).toBe(true);
      expect(isEvaluatorError(new FileNotFoundError("/test"))).toBe(true);
    });

    it("returns false for regular errors", () => {
      expect(isEvaluatorError(new Error("test"))).toBe(false);
      expect(isEvaluatorError(new TypeError("test"))).toBe(false);
    });

    it("returns false for non-errors", () => {
      expect(isEvaluatorError(null)).toBe(false);
      expect(isEvaluatorError("error")).toBe(false);
      expect(isEvaluatorError({ message: "test" })).toBe(false);
    });
  });

  describe("errorToMessage", () => {
    it("returns message from Error instances", () => {
      expect(errorToMessage(new Error("Test message"))).toBe("Test message");
    });

    it("returns string representation for non-errors", () => {
      expect(errorToMessage("string error")).toBe("string error");
      expect(errorToMessage(123)).toBe("123");
      expect(errorToMessage(null)).toBe("null");
      expect(errorToMessage(undefined)).toBe("undefined");
    });

    it("returns message from EvaluatorError", () => {
      expect(errorToMessage(new ValidationError("Validation failed"))).toBe(
        "Validation failed",
      );
    });
  });

  describe("getExitCode", () => {
    it("returns EvaluatorError exit code", () => {
      expect(getExitCode(new ValidationError("test"))).toBe(2);
      expect(getExitCode(new FileNotFoundError("/test"))).toBe(1);
    });

    it("returns 1 for regular errors", () => {
      expect(getExitCode(new Error("test"))).toBe(1);
      expect(getExitCode(new TypeError("test"))).toBe(1);
    });

    it("returns 1 for non-errors", () => {
      expect(getExitCode("error")).toBe(1);
      expect(getExitCode(null)).toBe(1);
    });
  });
});
