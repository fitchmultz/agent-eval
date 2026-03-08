/**
 * Purpose: Parses transcript JSONL files into normalized sessions, turns, messages, and tool activity.
 * Entrypoint: `parseTranscriptFile()` is used by the evaluator for canonical session reconstruction.
 * Notes: Supports both modern function-call events and older custom-tool-call events.
 */
import { createReadStream } from "node:fs";
import { basename } from "node:path";
import * as readline from "node:readline";

import { TranscriptParseError } from "./errors.js";
import type { SourceRef } from "./schema.js";

export interface ParsedToolCall {
  callId: string;
  toolName: string;
  categoryHint: string;
  argumentsText?: string | undefined;
  outputText?: string | undefined;
  status: "completed" | "errored" | "unknown";
  timestamp?: string | undefined;
}

export interface ParsedTurn {
  turnId?: string;
  turnIndex: number;
  startedAt?: string;
  cwd?: string;
  userMessages: string[];
  assistantMessages: string[];
  toolCalls: ParsedToolCall[];
  sourceRefs: SourceRef[];
}

export interface ParsedSession {
  sessionId: string;
  parentSessionId?: string;
  path: string;
  startedAt?: string;
  cwd?: string;
  turns: ParsedTurn[];
}

interface JsonlEventRecord {
  payload?: Record<string, unknown>;
  timestamp?: string;
  type?: string;
}

/**
 * Options for parsing transcript files.
 */
export interface ParseOptions {
  /** If true, throw on parse errors instead of skipping malformed lines. */
  strict?: boolean;
  /** Callback invoked when a line fails to parse (only called in non-strict mode). */
  onParseError?: (line: string, lineNumber: number, error: Error) => void;
}

/**
 * Context object that holds the mutable state during transcript parsing.
 * Passed to all event handlers to avoid global state and enable testability.
 */
export interface ParserContext {
  sessionId: string;
  parentSessionId?: string;
  sessionStartedAt?: string;
  sessionCwd?: string;
  turns: ParsedTurn[];
  currentTurn: ParsedTurn;
  nextTurnIndex: number;
  pendingToolCalls: Map<string, ParsedToolCall>;
  lineNumber: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getValue(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

function extractMessageText(
  payload: Record<string, unknown>,
): string | undefined {
  const content = getValue(payload, "content");
  if (!Array.isArray(content)) {
    return undefined;
  }

  const textParts: string[] = [];
  for (const item of content) {
    const record = asRecord(item);
    const text = record ? asString(getValue(record, "text")) : undefined;
    if (text) {
      textParts.push(text);
    }
  }

  return textParts.length > 0 ? textParts.join("\n") : undefined;
}

function normalizeToolOutput(
  outputText: string | undefined,
): ParsedToolCall["status"] {
  if (!outputText) {
    return "unknown";
  }

  if (
    outputText.includes("Process exited with code 0") ||
    outputText.includes("Command succeeded")
  ) {
    return "completed";
  }

  if (
    outputText.includes("Command failed with exit code") ||
    outputText.includes("Process exited with code 1") ||
    outputText.includes("Process exited with code 2")
  ) {
    return "errored";
  }

  return "unknown";
}

function createSourceRef(path: string, line: number): SourceRef {
  return {
    kind: "session_jsonl",
    path,
    line,
  };
}

function inferSessionIdFromFilename(path: string): string {
  const filename = basename(path, ".jsonl");
  const parts = filename.split("-");
  return parts.slice(-5).join("-");
}

export function createTurn(turnIndex: number): ParsedTurn {
  return {
    turnIndex,
    userMessages: [],
    assistantMessages: [],
    toolCalls: [],
    sourceRefs: [],
  };
}

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

export function hasTurnContent(turn: ParsedTurn): boolean {
  return (
    turn.userMessages.length > 0 ||
    turn.assistantMessages.length > 0 ||
    turn.toolCalls.length > 0
  );
}

function flushCurrentTurn(context: ParserContext): void {
  if (!hasTurnContent(context.currentTurn)) {
    return;
  }
  context.turns.push(context.currentTurn);
  context.nextTurnIndex += 1;
  context.currentTurn = createTurn(context.nextTurnIndex);
}

/**
 * Handles session_meta events by extracting session metadata including
 * session ID, timestamp, working directory, and parent session info.
 */
export function handleSessionMetaEvent(
  payload: Record<string, unknown>,
  event: JsonlEventRecord,
  context: ParserContext,
): void {
  context.sessionId = asString(getValue(payload, "id")) ?? context.sessionId;

  const startedAt = asString(getValue(payload, "timestamp")) ?? event.timestamp;
  if (startedAt) {
    context.sessionStartedAt = startedAt;
  }

  const cwd = asString(getValue(payload, "cwd"));
  if (cwd) {
    context.sessionCwd = cwd;
  }

  const source = asRecord(getValue(payload, "source"));
  const subagent = source ? asRecord(getValue(source, "subagent")) : undefined;
  const threadSpawn = subagent
    ? asRecord(getValue(subagent, "thread_spawn"))
    : undefined;
  const parentId = threadSpawn
    ? asString(getValue(threadSpawn, "parent_thread_id"))
    : undefined;
  if (parentId) {
    context.parentSessionId = parentId;
  }
}

/**
 * Handles turn_context events by flushing the current turn if it has content
 * and initializing a new turn with the provided context.
 */
export function handleTurnContextEvent(
  payload: Record<string, unknown>,
  event: JsonlEventRecord,
  sourceRef: SourceRef,
  context: ParserContext,
): void {
  flushCurrentTurn(context);

  const turnId = asString(getValue(payload, "turn_id"));
  const turnCwd = asString(getValue(payload, "cwd")) ?? context.sessionCwd;

  if (turnId) {
    context.currentTurn.turnId = turnId;
  }
  if (event.timestamp) {
    context.currentTurn.startedAt = event.timestamp;
  }
  if (turnCwd) {
    context.currentTurn.cwd = turnCwd;
  }
  context.currentTurn.sourceRefs.push(sourceRef);
}

/**
 * Handles message response items by extracting text content based on role.
 */
export function handleMessageResponse(
  payload: Record<string, unknown>,
  sourceRef: SourceRef,
  context: ParserContext,
): void {
  const text = extractMessageText(payload);
  if (!text) {
    return;
  }

  const role = asString(getValue(payload, "role"));

  if (role === "user") {
    context.currentTurn.userMessages.push(text);
  } else if (role === "assistant") {
    context.currentTurn.assistantMessages.push(text);
  }

  context.currentTurn.sourceRefs.push(sourceRef);
}

/**
 * Handles function_call response items by creating a pending tool call.
 */
export function handleFunctionCallResponse(
  payload: Record<string, unknown>,
  event: JsonlEventRecord,
  sourceRef: SourceRef,
  context: ParserContext,
): void {
  const callId = asString(getValue(payload, "call_id"));
  const toolName = asString(getValue(payload, "name"));
  if (!callId || !toolName) return;

  const toolCall: ParsedToolCall = {
    callId,
    toolName,
    categoryHint: "function_call",
    status: "unknown",
    argumentsText: asString(getValue(payload, "arguments")),
    timestamp: event.timestamp,
  };

  context.pendingToolCalls.set(callId, toolCall);
  context.currentTurn.toolCalls.push(toolCall);
  context.currentTurn.sourceRefs.push(sourceRef);
}

/**
 * Handles function_call_output response items by updating the matching pending tool call.
 */
export function handleFunctionCallOutputResponse(
  payload: Record<string, unknown>,
  sourceRef: SourceRef,
  context: ParserContext,
): void {
  const callId = asString(getValue(payload, "call_id"));
  const outputText = asString(getValue(payload, "output"));

  if (!callId) {
    return;
  }

  const toolCall = context.pendingToolCalls.get(callId);
  if (toolCall && outputText) {
    toolCall.outputText = outputText;
    toolCall.status = normalizeToolOutput(outputText);
  }

  context.currentTurn.sourceRefs.push(sourceRef);
}

/**
 * Handles custom_tool_call response items (legacy format) by creating a pending tool call.
 */
export function handleCustomToolCallResponse(
  payload: Record<string, unknown>,
  event: JsonlEventRecord,
  sourceRef: SourceRef,
  context: ParserContext,
): void {
  const callId = asString(getValue(payload, "call_id"));
  const toolName = asString(getValue(payload, "name"));
  if (!callId || !toolName) return;

  const toolCall: ParsedToolCall = {
    callId,
    toolName,
    categoryHint: "custom_tool_call",
    status:
      asString(getValue(payload, "status")) === "completed"
        ? "completed"
        : "unknown",
    argumentsText: asString(getValue(payload, "input")),
    timestamp: event.timestamp,
  };

  context.pendingToolCalls.set(callId, toolCall);
  context.currentTurn.toolCalls.push(toolCall);
  context.currentTurn.sourceRefs.push(sourceRef);
}

/**
 * Handles custom_tool_call_output response items (legacy format) by updating the matching tool call.
 */
export function handleCustomToolCallOutputResponse(
  payload: Record<string, unknown>,
  sourceRef: SourceRef,
  context: ParserContext,
): void {
  const callId = asString(getValue(payload, "call_id"));
  const outputText = asString(getValue(payload, "output"));

  if (!callId) {
    return;
  }

  const toolCall = context.pendingToolCalls.get(callId);
  if (toolCall && outputText) {
    toolCall.outputText = outputText;
    toolCall.status = normalizeToolOutput(outputText);
  }

  context.currentTurn.sourceRefs.push(sourceRef);
}

/**
 * Routes response_item events to the appropriate handler based on response type.
 */
export function handleResponseItemEvent(
  payload: Record<string, unknown>,
  event: JsonlEventRecord,
  sourceRef: SourceRef,
  context: ParserContext,
): void {
  const responseType = asString(getValue(payload, "type"));

  switch (responseType) {
    case "message":
      handleMessageResponse(payload, sourceRef, context);
      break;
    case "function_call":
      handleFunctionCallResponse(payload, event, sourceRef, context);
      break;
    case "function_call_output":
      handleFunctionCallOutputResponse(payload, sourceRef, context);
      break;
    case "custom_tool_call":
      handleCustomToolCallResponse(payload, event, sourceRef, context);
      break;
    case "custom_tool_call_output":
      handleCustomToolCallOutputResponse(payload, sourceRef, context);
      break;
  }
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
 * Builds the final ParsedSession from the parser context.
 */
export function buildParsedSession(
  context: ParserContext,
  path: string,
): ParsedSession {
  if (hasTurnContent(context.currentTurn)) {
    context.turns.push(context.currentTurn);
  }

  const parsedSession: ParsedSession = {
    sessionId: context.sessionId,
    path,
    turns: context.turns,
  };

  if (context.parentSessionId) {
    parsedSession.parentSessionId = context.parentSessionId;
  }
  if (context.sessionStartedAt) {
    parsedSession.startedAt = context.sessionStartedAt;
  }
  if (context.sessionCwd) {
    parsedSession.cwd = context.sessionCwd;
  }

  return parsedSession;
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
  const stream = createReadStream(path, { encoding: "utf8" });
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

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

      switch (event.type) {
        case "session_meta":
          handleSessionMetaEvent(event.payload, event, context);
          break;
        case "turn_context":
          handleTurnContextEvent(event.payload, event, sourceRef, context);
          break;
        case "response_item":
          handleResponseItemEvent(event.payload, event, sourceRef, context);
          break;
      }
    }
  } finally {
    reader.close();
    stream.close();
  }

  return buildParsedSession(context, path);
}
