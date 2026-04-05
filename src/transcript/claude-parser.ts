/**
 * Purpose: Parses Claude Code JSONL session transcripts into the evaluator's normalized ParsedSession model.
 * Responsibilities: Merge Claude message records into interaction-level turns, normalize tool calls, and preserve source refs.
 * Scope: Used only for Claude project-session JSONL transcripts; optional Claude enrichment stores are discovery-only.
 * Usage: `parseClaudeTranscriptFile(path, options)` is called via the shared `parseTranscriptFile()` dispatcher.
 * Invariants/Assumptions: Normalized turns represent a user request plus the assistant/tool work cycle, not raw Claude event granularity.
 */

import { normalizeError, TranscriptParseError } from "../errors.js";
import type { SourceProvider, SourceRef } from "../schema.js";
import { extractCommandTextFromArgumentsText } from "../tool-command-text.js";
import { throwIfAborted } from "../utils/abort.js";
import { createSourceRef } from "./event-router.js";
import { createTranscriptLineReader, getReaderStream } from "./file-reader.js";
import {
  appendScoringEvent,
  createTurn,
  hasTurnContent,
} from "./session-builder.js";
import { asRecord, asString, getValue, isRecord } from "./type-guards.js";
import type {
  ParsedSession,
  ParsedToolCall,
  ParsedTurn,
  ParseOptions,
  ScoringEvent,
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
  endedAt?: string;
  cwd?: string;
  harness: string;
  modelProvider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  compactionCount?: number;
  turns: ParsedTurn[];
  currentTurn: ParsedTurn;
  nextTurnIndex: number;
  scoringEvents: ScoringEvent[];
  nextScoringSequenceIndex: number;
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
    harness: "claude",
    turns: [],
    currentTurn: createTurn(0),
    nextTurnIndex: 0,
    scoringEvents: [],
    nextScoringSequenceIndex: 0,
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
  const alreadyAttached = turn.sourceRefs.some(
    (candidate) =>
      candidate.provider === sourceRef.provider &&
      candidate.kind === sourceRef.kind &&
      candidate.path === sourceRef.path &&
      candidate.line === sourceRef.line,
  );
  if (!alreadyAttached) {
    turn.sourceRefs.push(sourceRef);
  }
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

function stringifyToolResult(toolUseResult: unknown): string | undefined {
  if (toolUseResult === undefined) {
    return undefined;
  }

  if (typeof toolUseResult === "string") {
    return toolUseResult;
  }

  try {
    return JSON.stringify(toolUseResult);
  } catch {
    return String(toolUseResult);
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

  toolCall.outputText = stringifyToolResult(toolUseResult);
  toolCall.status = "completed";
}

interface ClaudeMessageParts {
  assistantMessages: string[];
  userMessages: string[];
  toolResults: Array<{ toolUseId: string | undefined; value: unknown }>;
  toolUses: Array<{
    id: string | undefined;
    input: unknown;
    name: string;
  }>;
}

function createEmptyMessageParts(): ClaudeMessageParts {
  return {
    assistantMessages: [],
    userMessages: [],
    toolResults: [],
    toolUses: [],
  };
}

function parseClaudeMessageParts(
  role: "user" | "assistant",
  message: Record<string, unknown>,
  toolUseResult: unknown,
): ClaudeMessageParts {
  const parts = createEmptyMessageParts();
  const content = getValue(message, "content");

  if (typeof content === "string") {
    appendMessageText(
      role === "user" ? parts.userMessages : parts.assistantMessages,
      content,
    );
    return parts;
  }

  if (!Array.isArray(content)) {
    return parts;
  }

  for (const item of content) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const itemType = asString(getValue(record, "type"));
    if (itemType === "text") {
      appendMessageText(
        role === "user" ? parts.userMessages : parts.assistantMessages,
        getValue(record, "text"),
      );
      continue;
    }

    if (itemType === "thinking" && role === "assistant") {
      continue;
    }

    if (itemType === "tool_use" && role === "assistant") {
      parts.toolUses.push({
        id: asString(getValue(record, "id")),
        input: getValue(record, "input"),
        name: asString(getValue(record, "name")) ?? "unknown_tool",
      });
      continue;
    }

    if (itemType === "tool_result" && role === "user") {
      parts.toolResults.push({
        toolUseId: asString(getValue(record, "tool_use_id")),
        value: toolUseResult ?? getValue(record, "content"),
      });
    }
  }

  return parts;
}

function setTurnMetadata(
  turn: ParsedTurn,
  record: ClaudeEventRecord,
  sourceRef: SourceRef,
): void {
  if (!turn.turnId && record.uuid) {
    turn.turnId = record.uuid;
  }
  if (!turn.startedAt && record.timestamp) {
    turn.startedAt = record.timestamp;
  }
  if (!turn.cwd && record.cwd) {
    turn.cwd = record.cwd;
  }
  addSourceRef(turn, sourceRef);
}

function flushCurrentClaudeTurn(state: ClaudeParseState): void {
  if (!hasTurnContent(state.currentTurn)) {
    return;
  }

  state.turns.push(state.currentTurn);
  state.nextTurnIndex += 1;
  state.currentTurn = createTurn(state.nextTurnIndex);
}

function appendAssistantActivity(
  state: ClaudeParseState,
  record: ClaudeEventRecord,
  sourceRef: SourceRef,
  parts: ClaudeMessageParts,
): void {
  setTurnMetadata(state.currentTurn, record, sourceRef);

  for (const message of parts.assistantMessages) {
    appendMessageText(state.currentTurn.assistantMessages, message);
    appendScoringEvent(state, {
      kind: "assistant_message",
      text: message,
      timestamp: record.timestamp ?? state.currentTurn.startedAt,
      cwd: record.cwd ?? state.currentTurn.cwd,
    });
  }

  for (const toolUse of parts.toolUses) {
    const toolUseId =
      toolUse.id ??
      `${state.currentTurn.turnId ?? `turn-${state.nextTurnIndex}`}-tool-${state.currentTurn.toolCalls.length + 1}`;
    const parsedToolCall: ParsedToolCall = {
      callId: toolUseId,
      toolName: toolUse.name,
      categoryHint: "other",
      argumentsText: normalizeToolInput(toolUse.input),
      status: "unknown",
      timestamp: state.currentTurn.startedAt,
    };
    parsedToolCall.scoringEventIndex = appendScoringEvent(state, {
      kind: "tool_call",
      toolName: parsedToolCall.toolName,
      commandText: extractCommandTextFromArgumentsText(
        parsedToolCall.argumentsText,
      ),
      status: parsedToolCall.status,
      timestamp: parsedToolCall.timestamp,
      cwd: record.cwd ?? state.currentTurn.cwd,
    });
    state.currentTurn.toolCalls.push(parsedToolCall);
    state.pendingToolCalls.set(toolUseId, parsedToolCall);
  }

  if (
    parts.assistantMessages.length === 0 &&
    parts.toolUses.length === 0 &&
    record.error
  ) {
    state.currentTurn.assistantMessages.push(record.error);
  }
}

function appendToolResults(
  state: ClaudeParseState,
  record: ClaudeEventRecord,
  sourceRef: SourceRef,
  parts: ClaudeMessageParts,
): void {
  if (parts.toolResults.length === 0) {
    return;
  }

  setTurnMetadata(state.currentTurn, record, sourceRef);
  for (const toolResult of parts.toolResults) {
    attachToolResult(
      state.pendingToolCalls,
      toolResult.toolUseId,
      toolResult.value,
    );
    const toolCall = toolResult.toolUseId
      ? state.pendingToolCalls.get(toolResult.toolUseId)
      : undefined;
    if (toolCall && typeof toolCall.scoringEventIndex === "number") {
      const scoringEvent = state.scoringEvents[toolCall.scoringEventIndex];
      if (scoringEvent) {
        state.scoringEvents[toolCall.scoringEventIndex] = {
          ...scoringEvent,
          status: toolCall.status,
        };
      }
    }
  }
}

function applyClaudeRecord(
  state: ClaudeParseState,
  record: ClaudeEventRecord,
  sourceRef: SourceRef,
): void {
  const message = record.message;
  const role = message ? asString(getValue(message, "role")) : undefined;

  if (!message || (role !== "user" && role !== "assistant")) {
    return;
  }

  const parts = parseClaudeMessageParts(role, message, record.toolUseResult);

  if (role === "assistant") {
    appendAssistantActivity(state, record, sourceRef, parts);
    return;
  }

  appendToolResults(state, record, sourceRef, parts);

  const hasUserAuthoredText = parts.userMessages.length > 0;
  if (!hasUserAuthoredText) {
    return;
  }

  if (hasTurnContent(state.currentTurn)) {
    flushCurrentClaudeTurn(state);
  }

  setTurnMetadata(state.currentTurn, record, sourceRef);
  for (const messageText of parts.userMessages) {
    appendMessageText(state.currentTurn.userMessages, messageText);
    appendScoringEvent(state, {
      kind: "user_message",
      text: messageText,
      timestamp: record.timestamp ?? state.currentTurn.startedAt,
      cwd: record.cwd ?? state.currentTurn.cwd,
    });
  }
}

export async function parseClaudeTranscriptFile(
  path: string,
  options: ParseOptions = {},
): Promise<ParsedSession> {
  const provider: SourceProvider = options.sourceProvider ?? "claude";
  throwIfAborted(options.signal);
  const reader = createTranscriptLineReader(path);
  const stream = getReaderStream(reader);
  const state = createInitialState(path);
  let parentSessionId: string | undefined;
  let lineNumber = 0;
  let parseWarningCount = 0;
  const onParseError = (
    line: string,
    warningLineNumber: number,
    error: Error,
  ): void => {
    parseWarningCount += 1;
    options.onParseError?.(line, warningLineNumber, error);
  };

  try {
    for await (const rawLine of reader) {
      throwIfAborted(options.signal);

      const line = rawLine.trim();
      if (line.length === 0) {
        continue;
      }

      lineNumber += 1;
      const record = parseClaudeEventLine(line, lineNumber, path, {
        ...options,
        onParseError,
      });
      if (!record) {
        continue;
      }

      state.sessionId = record.sessionId ?? state.sessionId;
      if (!state.startedAt && record.timestamp) {
        state.startedAt = record.timestamp;
      }
      if (record.timestamp) {
        state.endedAt = record.timestamp;
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
      applyClaudeRecord(state, record, sourceRef);
    }
  } finally {
    reader.close();
    (stream as { destroy?: () => void } | undefined)?.destroy?.();
  }

  flushCurrentClaudeTurn(state);

  const parsedSession: ParsedSession = {
    sessionId: state.sessionId,
    provider,
    path,
    turns: state.turns,
    scoringEvents: state.scoringEvents,
    parseWarningCount,
  };

  if (parentSessionId) {
    parsedSession.parentSessionId = parentSessionId;
  }
  if (state.startedAt) {
    parsedSession.startedAt = state.startedAt;
  }
  if (state.endedAt) {
    parsedSession.endedAt = state.endedAt;
  }
  if (state.cwd) {
    parsedSession.cwd = state.cwd;
  }
  parsedSession.harness = state.harness;
  if (state.modelProvider) {
    parsedSession.modelProvider = state.modelProvider;
  }
  if (state.model) {
    parsedSession.model = state.model;
  }
  if (typeof state.inputTokens === "number") {
    parsedSession.inputTokens = state.inputTokens;
  }
  if (typeof state.outputTokens === "number") {
    parsedSession.outputTokens = state.outputTokens;
  }
  if (typeof state.totalTokens === "number") {
    parsedSession.totalTokens = state.totalTokens;
  }
  if (typeof state.compactionCount === "number") {
    parsedSession.compactionCount = state.compactionCount;
  }

  return parsedSession;
}
