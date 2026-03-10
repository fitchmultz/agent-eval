/**
 * Purpose: Parses Claude Code JSONL session transcripts into the evaluator's normalized ParsedSession model.
 * Responsibilities: Read Claude Code records, extract user/assistant messages, normalize tool calls, and preserve source refs.
 * Scope: Used only for Claude project-session JSONL transcripts; optional Claude enrichment stores are discovery-only.
 * Usage: `parseClaudeTranscriptFile(path, options)` is called via the shared `parseTranscriptFile()` dispatcher.
 * Invariants/Assumptions: Each Claude JSONL line is an independent event record and tool results may arrive on later lines.
 */

import { normalizeError, TranscriptParseError } from "../errors.js";
import type { SourceProvider, SourceRef } from "../schema.js";
import { createSourceRef } from "./event-router.js";
import { createTranscriptLineReader, getReaderStream } from "./file-reader.js";
import { createTurn } from "./session-builder.js";
import { asRecord, asString, getValue, isRecord } from "./type-guards.js";
import type {
  ParsedSession,
  ParsedToolCall,
  ParsedTurn,
  ParseOptions,
} from "./types.js";

interface ClaudeEventRecord {
  cwd?: string;
  error?: string;
  message?: Record<string, unknown>;
  parentUuid?: string | null;
  sessionId?: string;
  timestamp?: string;
  toolUseResult?: unknown;
  type?: string;
  uuid?: string;
}

interface ClaudeParseState {
  sessionId: string;
  startedAt?: string;
  cwd?: string;
  turns: ParsedTurn[];
  nextTurnIndex: number;
  pendingToolCalls: Map<string, ParsedToolCall>;
}

function createInitialState(path: string): ClaudeParseState {
  const filename =
    path
      .split("/")
      .pop()
      ?.replace(/\.jsonl$/, "") ?? "unknown";
  return {
    sessionId: filename,
    turns: [],
    nextTurnIndex: 0,
    pendingToolCalls: new Map(),
  };
}

function parseClaudeEventLine(
  line: string,
  lineNumber: number,
  path: string,
  options: ParseOptions,
): ClaudeEventRecord | undefined {
  try {
    const parsedUnknown: unknown = JSON.parse(line);
    if (!isRecord(parsedUnknown)) {
      throw new Error("Claude JSONL record is not an object");
    }

    const eventRecord: ClaudeEventRecord = {
      toolUseResult: getValue(parsedUnknown, "toolUseResult"),
    };
    const cwd = asString(getValue(parsedUnknown, "cwd"));
    const errorText = asString(getValue(parsedUnknown, "error"));
    const message = asRecord(getValue(parsedUnknown, "message"));
    const rawParentUuid = getValue(parsedUnknown, "parentUuid");
    const parentUuid = rawParentUuid === null ? null : asString(rawParentUuid);
    const sessionId = asString(getValue(parsedUnknown, "sessionId"));
    const timestamp = asString(getValue(parsedUnknown, "timestamp"));
    const type = asString(getValue(parsedUnknown, "type"));
    const uuid = asString(getValue(parsedUnknown, "uuid"));

    if (cwd) eventRecord.cwd = cwd;
    if (errorText) eventRecord.error = errorText;
    if (message) eventRecord.message = message;
    if (parentUuid !== undefined) eventRecord.parentUuid = parentUuid;
    if (sessionId) eventRecord.sessionId = sessionId;
    if (timestamp) eventRecord.timestamp = timestamp;
    if (type) eventRecord.type = type;
    if (uuid) eventRecord.uuid = uuid;

    return eventRecord;
  } catch (error) {
    const normalizedError = normalizeError(error);
    if (options.strict) {
      throw new TranscriptParseError(path, lineNumber, normalizedError);
    }

    options.onParseError?.(line, lineNumber, normalizedError);
    return undefined;
  }
}

function addSourceRef(turn: ParsedTurn, sourceRef: SourceRef): void {
  turn.sourceRefs.push(sourceRef);
}

function appendMessageText(messages: string[], value: unknown): void {
  if (typeof value === "string" && value.trim().length > 0) {
    messages.push(value);
  }
}

function normalizeToolInput(input: unknown): string | undefined {
  if (input === undefined) {
    return undefined;
  }

  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function attachToolResult(
  pendingToolCalls: Map<string, ParsedToolCall>,
  toolUseId: string | undefined,
  toolUseResult: unknown,
): void {
  if (!toolUseId) {
    return;
  }

  const toolCall = pendingToolCalls.get(toolUseId);
  if (!toolCall) {
    return;
  }

  toolCall.outputText =
    toolUseResult === undefined ? undefined : JSON.stringify(toolUseResult);
  toolCall.status = "completed";
}

function extractClaudeMessageContent(
  state: ClaudeParseState,
  role: "user" | "assistant",
  message: Record<string, unknown>,
  turn: ParsedTurn,
  sourceRef: SourceRef,
  toolUseResult: unknown,
): void {
  const content = getValue(message, "content");

  if (typeof content === "string") {
    appendMessageText(
      role === "user" ? turn.userMessages : turn.assistantMessages,
      content,
    );
    return;
  }

  if (!Array.isArray(content)) {
    return;
  }

  for (const item of content) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const itemType = asString(getValue(record, "type"));
    if (itemType === "text") {
      appendMessageText(
        role === "user" ? turn.userMessages : turn.assistantMessages,
        getValue(record, "text"),
      );
      continue;
    }

    if (itemType === "thinking" && role === "assistant") {
      appendMessageText(turn.assistantMessages, getValue(record, "thinking"));
      continue;
    }

    if (itemType === "tool_use" && role === "assistant") {
      const toolUseId =
        asString(getValue(record, "id")) ?? `${turn.turnId}-tool`;
      const toolName = asString(getValue(record, "name")) ?? "unknown_tool";
      const parsedToolCall: ParsedToolCall = {
        callId: toolUseId,
        toolName,
        categoryHint: "other",
        argumentsText: normalizeToolInput(getValue(record, "input")),
        status: "unknown",
        timestamp: turn.startedAt,
      };
      turn.toolCalls.push(parsedToolCall);
      addSourceRef(turn, sourceRef);
      state.pendingToolCalls.set(toolUseId, parsedToolCall);
      continue;
    }

    if (itemType === "tool_result" && role === "user") {
      attachToolResult(
        state.pendingToolCalls,
        asString(getValue(record, "tool_use_id")),
        toolUseResult ?? getValue(record, "content"),
      );
    }
  }
}

function buildClaudeTurn(
  state: ClaudeParseState,
  record: ClaudeEventRecord,
  sourceRef: SourceRef,
): ParsedTurn | undefined {
  const message = record.message;
  const role = message ? asString(getValue(message, "role")) : undefined;

  if (!message || (role !== "user" && role !== "assistant")) {
    return undefined;
  }

  const turn = createTurn(state.nextTurnIndex);
  if (record.uuid) {
    turn.turnId = record.uuid;
  }
  if (record.timestamp) {
    turn.startedAt = record.timestamp;
  }
  const turnCwd = record.cwd ?? state.cwd;
  if (turnCwd) {
    turn.cwd = turnCwd;
  }
  addSourceRef(turn, sourceRef);

  extractClaudeMessageContent(
    state,
    role,
    message,
    turn,
    sourceRef,
    record.toolUseResult,
  );

  if (
    role === "assistant" &&
    turn.assistantMessages.length === 0 &&
    typeof record.toolUseResult === "string"
  ) {
    turn.assistantMessages.push(record.toolUseResult);
  }

  if (
    role === "assistant" &&
    record.error &&
    turn.assistantMessages.length === 0
  ) {
    turn.assistantMessages.push(record.error);
  }

  if (
    turn.userMessages.length === 0 &&
    turn.assistantMessages.length === 0 &&
    turn.toolCalls.length === 0
  ) {
    return undefined;
  }

  state.nextTurnIndex += 1;
  return turn;
}

export async function parseClaudeTranscriptFile(
  path: string,
  options: ParseOptions = {},
): Promise<ParsedSession> {
  const provider: SourceProvider = options.sourceProvider ?? "claude";
  const reader = createTranscriptLineReader(path);
  const stream = getReaderStream(reader);
  const state = createInitialState(path);
  let parentSessionId: string | undefined;
  let lineNumber = 0;

  try {
    for await (const rawLine of reader) {
      const line = rawLine.trim();
      if (line.length === 0) {
        continue;
      }

      lineNumber += 1;
      const record = parseClaudeEventLine(line, lineNumber, path, options);
      if (!record) {
        continue;
      }

      state.sessionId = record.sessionId ?? state.sessionId;
      if (!state.startedAt && record.timestamp) {
        state.startedAt = record.timestamp;
      }
      if (!state.cwd && record.cwd) {
        state.cwd = record.cwd;
      }
      if (
        !parentSessionId &&
        record.parentUuid &&
        record.parentUuid.length > 0
      ) {
        parentSessionId = record.parentUuid;
      }

      const sourceRef = createSourceRef(provider, path, lineNumber);
      const turn = buildClaudeTurn(state, record, sourceRef);
      if (turn) {
        state.turns.push(turn);
      }
    }
  } finally {
    reader.close();
    (stream as { destroy?: () => void } | undefined)?.destroy?.();
  }

  const parsedSession: ParsedSession = {
    sessionId: state.sessionId,
    provider,
    path,
    turns: state.turns,
  };

  if (parentSessionId) {
    parsedSession.parentSessionId = parentSessionId;
  }
  if (state.startedAt) {
    parsedSession.startedAt = state.startedAt;
  }
  if (state.cwd) {
    parsedSession.cwd = state.cwd;
  }

  return parsedSession;
}
