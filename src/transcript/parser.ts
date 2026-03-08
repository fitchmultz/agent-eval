/**
 * Purpose: Main orchestrator for transcript parsing.
 * Entrypoint: `parseTranscriptFile()` is used by the evaluator for canonical session reconstruction.
 * Notes: Delegates to specialized handlers for different event types.
 */

import { basename } from "node:path";
import { TranscriptParseError } from "../errors.js";
import { createSourceRef, routeEvent } from "./event-router.js";
import { createTranscriptLineReader } from "./file-reader.js";
import { buildParsedSession, createTurn } from "./session-builder.js";
import { asRecord, asString, getValue } from "./type-guards.js";
import type {
  JsonlEventRecord,
  ParsedSession,
  ParseOptions,
  ParserContext,
} from "./types.js";

/**
 * Infers session ID from the filename.
 * Extracts the last 5 hyphen-separated parts from the filename.
 */
function inferSessionIdFromFilename(path: string): string {
  const filename = basename(path, ".jsonl");
  const parts = filename.split("-");
  return parts.slice(-5).join("-");
}

/**
 * Creates a new parser context for the given file path.
 */
export function createParserContext(path: string): ParserContext {
  return {
    sessionId: inferSessionIdFromFilename(path),
    turns: [],
    currentTurn: createTurn(0),
    nextTurnIndex: 0,
    pendingToolCalls: new Map(),
    lineNumber: 0,
  };
}

/**
 * Parses a single JSONL line into an event record.
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
  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(line);
  } catch (error) {
    if (options.strict) {
      throw new TranscriptParseError(path, lineNumber, error as Error);
    }
    options.onParseError?.(line, lineNumber, error as Error);
    return {};
  }

  const eventRecord = asRecord(parsedUnknown);
  if (!eventRecord) {
    return {};
  }

  const event: JsonlEventRecord = {};
  const timestamp = asString(getValue(eventRecord, "timestamp"));
  const eventType = asString(getValue(eventRecord, "type"));
  const eventPayload = asRecord(getValue(eventRecord, "payload"));

  if (timestamp) {
    event.timestamp = timestamp;
  }
  if (eventType) {
    event.type = eventType;
  }
  if (eventPayload) {
    event.payload = eventPayload;
  }

  return event;
}

/**
 * Parses a transcript JSONL file into a normalized ParsedSession.
 * Orchestrates the parsing process by delegating to specialized handlers.
 *
 * @param path - Path to the transcript JSONL file
 * @param options - Optional parsing options
 * @returns The parsed session
 * @throws TranscriptParseError if strict mode is enabled and a line fails to parse
 */
export async function parseTranscriptFile(
  path: string,
  options: ParseOptions = {},
): Promise<ParsedSession> {
  const context = createParserContext(path);
  const reader = createTranscriptLineReader(path);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = (reader as any).input || (reader as any)._inputStream;

  try {
    for await (const rawLine of reader) {
      const line = rawLine.trim();
      if (line.length === 0) {
        continue;
      }

      context.lineNumber += 1;
      const event = parseEventLine(line, context.lineNumber, path, options);

      if (!event.payload) {
        continue;
      }

      const sourceRef = createSourceRef(path, context.lineNumber);
      routeEvent(event, sourceRef, context);
    }
  } finally {
    reader.close();
    stream?.close?.();
  }

  return buildParsedSession(context, path);
}
