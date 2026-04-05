/**
 * Purpose: Main transcript parsing dispatcher for supported developer-agent transcript formats.
 * Responsibilities: Parse Codex transcript files directly and route Claude Code and pi files to source-specific adapters.
 * Scope: Shared entrypoint used by the evaluator to normalize transcript files into ParsedSession objects.
 * Usage: Call `parseTranscriptFile(path, options)` and optionally set `sourceProvider` to skip path inference.
 * Invariants/Assumptions: Codex transcript parsing remains Zod-validated; Claude Code and pi use source-specific adapters.
 */

import { normalizeError, TranscriptParseError } from "../errors.js";
import { detectSourceProviderFromPath } from "../sources.js";
import {
  combineSignals,
  createTimeoutSignal,
  throwIfAborted,
} from "../utils/abort.js";
import { parseClaudeTranscriptFile } from "./claude-parser.js";
import { createSourceRef, routeEvent } from "./event-router.js";
import { createTranscriptLineReader, getReaderStream } from "./file-reader.js";
import { parsePiTranscriptFile } from "./pi-parser.js";
import { validateEventRecord } from "./schema.js";
import {
  buildParsedSession,
  createTurn,
  inferSessionIdFromFilename,
} from "./session-builder.js";
import type {
  JsonlEventRecord,
  ParsedSession,
  ParseOptions,
  ParserContext,
} from "./types.js";

/**
 * Creates a new parser context for the given file path.
 */
export function createParserContext(path: string): ParserContext {
  return {
    sessionId: inferSessionIdFromFilename(path),
    sessionMetaSeen: false,
    sessionHarness: "codex",
    turns: [],
    currentTurn: createTurn(0),
    nextTurnIndex: 0,
    scoringEvents: [],
    nextScoringSequenceIndex: 0,
    pendingToolCalls: new Map(),
    lineNumber: 0,
  };
}

/**
 * Parses a single JSONL line into an event record with Zod schema validation.
 * Returns an empty object if parsing fails (in non-strict mode).
 *
 * @param line - The JSONL line to parse
 * @param lineNumber - The line number for error reporting
 * @param path - The file path for error reporting
 * @param options - Parsing options
 * @returns The parsed event record, or empty object if parsing fails
 * @throws TranscriptParseError if strict mode is enabled and parsing fails
 */
export function parseEventLine(
  line: string,
  lineNumber: number,
  path: string,
  options: ParseOptions = {},
): JsonlEventRecord {
  // Check for abort before processing
  throwIfAborted(options.signal);

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(line);
  } catch (error) {
    const normalizedError = normalizeError(error);
    if (options.strict) {
      throw new TranscriptParseError(path, lineNumber, normalizedError);
    }
    options.onParseError?.(line, lineNumber, normalizedError);
    return {};
  }

  // Validate with Zod schema
  const validated = validateEventRecord(parsedUnknown);
  if (!validated) {
    const validationError = new Error(
      "JSONL record does not match expected schema",
    );
    if (options.strict) {
      throw new TranscriptParseError(path, lineNumber, validationError);
    }
    options.onParseError?.(line, lineNumber, validationError);
    return {};
  }

  // Convert validated record to JsonlEventRecord format
  const event: JsonlEventRecord = {};

  if (validated.timestamp !== undefined) {
    event.timestamp = validated.timestamp;
  }
  if (validated.type !== undefined) {
    event.type = validated.type;
  }
  if (validated.payload !== undefined) {
    event.payload = validated.payload;
  }

  return event;
}

/**
 * Internal implementation of transcript parsing with abort signal support.
 * This function performs the actual parsing work.
 */
async function doParseCodexTranscriptFile(
  path: string,
  options: ParseOptions = {},
): Promise<ParsedSession> {
  const context = createParserContext(path);
  let parseWarningCount = 0;
  const onParseError = (
    line: string,
    lineNumber: number,
    error: Error,
  ): void => {
    parseWarningCount += 1;
    options.onParseError?.(line, lineNumber, error);
  };
  const reader = createTranscriptLineReader(path);
  const stream = getReaderStream(reader);

  try {
    for await (const rawLine of reader) {
      // Check for abort signal before processing each line
      throwIfAborted(options.signal);

      const line = rawLine.trim();
      if (line.length === 0) {
        continue;
      }

      context.lineNumber += 1;
      const event = parseEventLine(line, context.lineNumber, path, {
        ...options,
        onParseError,
      });

      if (!event.payload) {
        continue;
      }

      if (event.timestamp) {
        context.sessionEndedAt = event.timestamp;
      }

      const sourceRef = createSourceRef("codex", path, context.lineNumber);
      routeEvent(event, sourceRef, context);
    }
  } finally {
    reader.close();
    (stream as { destroy?: () => void } | undefined)?.destroy?.();
  }

  return {
    ...buildParsedSession(context, path, "codex"),
    parseWarningCount,
  };
}

/**
 * Parses a transcript JSONL file into a normalized ParsedSession.
 * Orchestrates the parsing process with Zod schema validation.
 * Supports timeout and cancellation via AbortSignal.
 *
 * @param path - Path to the transcript JSONL file
 * @param options - Optional parsing options including timeoutMs and signal
 * @returns The parsed session
 * @throws TranscriptParseError if strict mode is enabled and a line fails to parse
 * @throws DOMException with name "TimeoutError" if timeout is exceeded
 * @throws DOMException with name "AbortError" if signal is aborted
 */
export async function parseTranscriptFile(
  path: string,
  options: ParseOptions = {},
): Promise<ParsedSession> {
  const timeoutMs = options.timeoutMs ?? 30000; // 30 second default

  // Create timeout signal if needed
  const timeoutResult = createTimeoutSignal(timeoutMs);
  const timeoutSignal = timeoutResult?.signal;
  const clearTimeoutFn = timeoutResult?.clear;

  // Combine user signal with timeout signal
  const combinedSignal = options.signal
    ? timeoutSignal
      ? combineSignals([options.signal, timeoutSignal])
      : options.signal
    : timeoutSignal;

  try {
    const sourceProvider =
      options.sourceProvider ?? detectSourceProviderFromPath(path) ?? "codex";

    if (sourceProvider === "claude") {
      return await parseClaudeTranscriptFile(path, {
        ...options,
        signal: combinedSignal,
        sourceProvider,
      });
    }

    if (sourceProvider === "pi") {
      return await parsePiTranscriptFile(path, {
        ...options,
        signal: combinedSignal,
        sourceProvider,
      });
    }

    return await doParseCodexTranscriptFile(path, {
      ...options,
      signal: combinedSignal,
      sourceProvider,
    });
  } finally {
    // Always clean up timeout
    clearTimeoutFn?.();
  }
}
