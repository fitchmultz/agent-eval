/**
 * Purpose: Parses pi JSONL session transcripts into the evaluator's normalized ParsedSession model.
 * Responsibilities: Resolve the current branch path, normalize pi message/tool records into turns, and preserve source refs.
 * Scope: Used only for pi session JSONL transcripts stored under the pi session directory.
 * Usage: `parsePiTranscriptFile(path, options)` is called via the shared `parseTranscriptFile()` dispatcher.
 * Invariants/Assumptions: The current session branch is reconstructed from the last persisted entry back to the root via `parentId` links.
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

interface PiEventRecord {
  cwd?: string;
  id?: string;
  message?: Record<string, unknown>;
  parentId?: string | null;
  parentSession?: string;
  timestamp?: string;
  type?: string;
}

interface PiIndexedEventRecord {
  lineNumber: number;
  record: PiEventRecord;
  sourceRef: SourceRef;
}

interface PiParseState {
  sessionId: string;
  startedAt?: string;
  cwd?: string;
  turns: ParsedTurn[];
  currentTurn: ParsedTurn;
  nextTurnIndex: number;
  scoringEvents: ScoringEvent[];
  nextScoringSequenceIndex: number;
  pendingToolCalls: Map<string, ParsedToolCall>;
}

interface PiMessageParts {
  assistantMessages: string[];
  toolUses: Array<{
    argumentsValue: unknown;
    id: string | undefined;
    name: string;
  }>;
  userMessages: string[];
}

function createInitialState(path: string): PiParseState {
  const filename =
    path
      .split("/")
      .pop()
      ?.replace(/\.jsonl$/, "") ?? "unknown";
  return {
    sessionId: filename,
    turns: [],
    currentTurn: createTurn(0),
    nextTurnIndex: 0,
    scoringEvents: [],
    nextScoringSequenceIndex: 0,
    pendingToolCalls: new Map(),
  };
}

function parsePiEventLine(
  line: string,
  lineNumber: number,
  path: string,
  options: ParseOptions,
): PiEventRecord | undefined {
  try {
    const parsedUnknown: unknown = JSON.parse(line);
    if (!isRecord(parsedUnknown)) {
      throw new Error("pi JSONL record is not an object");
    }

    const eventRecord: PiEventRecord = {};
    const cwd = asString(getValue(parsedUnknown, "cwd"));
    const id = asString(getValue(parsedUnknown, "id"));
    const message = asRecord(getValue(parsedUnknown, "message"));
    const rawParentId = getValue(parsedUnknown, "parentId");
    const parentId = rawParentId === null ? null : asString(rawParentId);
    const parentSession = asString(getValue(parsedUnknown, "parentSession"));
    const timestamp = asString(getValue(parsedUnknown, "timestamp"));
    const type = asString(getValue(parsedUnknown, "type"));

    if (cwd) eventRecord.cwd = cwd;
    if (id) eventRecord.id = id;
    if (message) eventRecord.message = message;
    if (parentId !== undefined) eventRecord.parentId = parentId;
    if (parentSession) eventRecord.parentSession = parentSession;
    if (timestamp) eventRecord.timestamp = timestamp;
    if (type) eventRecord.type = type;

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

function stringifyUnknown(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractTextFromContent(content: unknown): string[] {
  if (typeof content === "string") {
    return content.trim().length > 0 ? [content] : [];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  const textParts: string[] = [];
  for (const item of content) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const itemType = asString(getValue(record, "type"));
    if (itemType === "text") {
      appendMessageText(textParts, getValue(record, "text"));
      continue;
    }

    if (itemType === "thinking") {
      appendMessageText(textParts, getValue(record, "thinking"));
    }
  }

  return textParts;
}

function parsePiAssistantContent(
  message: Record<string, unknown>,
): PiMessageParts {
  const parts: PiMessageParts = {
    assistantMessages: [],
    toolUses: [],
    userMessages: [],
  };
  const content = getValue(message, "content");

  if (typeof content === "string") {
    appendMessageText(parts.assistantMessages, content);
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
      appendMessageText(parts.assistantMessages, getValue(record, "text"));
      continue;
    }

    if (itemType === "thinking") {
      appendMessageText(parts.assistantMessages, getValue(record, "thinking"));
      continue;
    }

    if (itemType === "toolCall") {
      parts.toolUses.push({
        argumentsValue: getValue(record, "arguments"),
        id: asString(getValue(record, "id")),
        name: asString(getValue(record, "name")) ?? "unknown_tool",
      });
    }
  }

  return parts;
}

function parsePiUserContent(message: Record<string, unknown>): PiMessageParts {
  return {
    assistantMessages: [],
    toolUses: [],
    userMessages: extractTextFromContent(getValue(message, "content")),
  };
}

function setTurnMetadata(
  turn: ParsedTurn,
  record: PiEventRecord,
  sourceRef: SourceRef,
): void {
  if (!turn.turnId && record.id) {
    turn.turnId = record.id;
  }
  if (!turn.startedAt && record.timestamp) {
    turn.startedAt = record.timestamp;
  }
  if (!turn.cwd && record.cwd) {
    turn.cwd = record.cwd;
  }
  addSourceRef(turn, sourceRef);
}

function flushCurrentPiTurn(state: PiParseState): void {
  if (!hasTurnContent(state.currentTurn)) {
    return;
  }

  state.turns.push(state.currentTurn);
  state.nextTurnIndex += 1;
  state.currentTurn = createTurn(state.nextTurnIndex);
}

function attachToolResult(
  pendingToolCalls: Map<string, ParsedToolCall>,
  message: Record<string, unknown>,
): void {
  const toolCallId = asString(getValue(message, "toolCallId"));
  if (!toolCallId) {
    return;
  }

  const toolCall = pendingToolCalls.get(toolCallId);
  if (!toolCall) {
    return;
  }

  const outputTexts = extractTextFromContent(getValue(message, "content"));
  toolCall.outputText =
    outputTexts.length > 0
      ? outputTexts.join("\n")
      : stringifyUnknown(getValue(message, "content"));
  toolCall.status =
    getValue(message, "isError") === true ? "errored" : "completed";
}

function appendAssistantActivity(
  state: PiParseState,
  record: PiEventRecord,
  sourceRef: SourceRef,
  parts: PiMessageParts,
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
      argumentsText: normalizeToolInput(toolUse.argumentsValue),
      status: "unknown",
      timestamp: record.timestamp ?? state.currentTurn.startedAt,
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
}

function appendToolResult(
  state: PiParseState,
  record: PiEventRecord,
  sourceRef: SourceRef,
  message: Record<string, unknown>,
): void {
  setTurnMetadata(state.currentTurn, record, sourceRef);
  attachToolResult(state.pendingToolCalls, message);

  const toolCallId = asString(getValue(message, "toolCallId"));
  const toolCall = toolCallId
    ? state.pendingToolCalls.get(toolCallId)
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

function applyPiRecord(
  state: PiParseState,
  record: PiEventRecord,
  sourceRef: SourceRef,
): void {
  if (record.type !== "message" || !record.message) {
    return;
  }

  const role = asString(getValue(record.message, "role"));
  if (role === "assistant") {
    appendAssistantActivity(
      state,
      record,
      sourceRef,
      parsePiAssistantContent(record.message),
    );
    return;
  }

  if (role === "toolResult") {
    appendToolResult(state, record, sourceRef, record.message);
    return;
  }

  if (role !== "user") {
    return;
  }

  const parts = parsePiUserContent(record.message);
  if (parts.userMessages.length === 0) {
    return;
  }

  if (hasTurnContent(state.currentTurn)) {
    flushCurrentPiTurn(state);
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

function buildCurrentBranchPath(
  entries: readonly PiIndexedEventRecord[],
): PiIndexedEventRecord[] {
  const branchEntries = entries.filter(
    (entry) => entry.record.type !== "session",
  );
  const leaf = branchEntries[branchEntries.length - 1];
  if (!leaf?.record.id) {
    return [];
  }

  const byId = new Map<string, PiIndexedEventRecord>();
  for (const entry of branchEntries) {
    const id = entry.record.id;
    if (id) {
      byId.set(id, entry);
    }
  }

  const path: PiIndexedEventRecord[] = [];
  const visited = new Set<string>();
  let current: PiIndexedEventRecord | undefined = leaf;

  while (current?.record.id && !visited.has(current.record.id)) {
    path.unshift(current);
    visited.add(current.record.id);
    const parentId: string | null | undefined = current.record.parentId;
    current = parentId ? byId.get(parentId) : undefined;
  }

  return path;
}

export async function parsePiTranscriptFile(
  path: string,
  options: ParseOptions = {},
): Promise<ParsedSession> {
  const provider: SourceProvider = options.sourceProvider ?? "pi";
  throwIfAborted(options.signal);
  const reader = createTranscriptLineReader(path);
  const stream = getReaderStream(reader);
  const state = createInitialState(path);
  const parsedEntries: PiIndexedEventRecord[] = [];
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
      const record = parsePiEventLine(line, lineNumber, path, {
        ...options,
        onParseError,
      });
      if (!record) {
        continue;
      }

      if (record.type === "session") {
        state.sessionId = record.id ?? state.sessionId;
        if (record.timestamp) {
          state.startedAt = record.timestamp;
        }
        if (record.cwd) {
          state.cwd = record.cwd;
        }
        parentSessionId = record.parentSession ?? parentSessionId;
      }

      const sourceRef = createSourceRef(provider, path, lineNumber);
      parsedEntries.push({
        lineNumber,
        record,
        sourceRef,
      });
    }
  } finally {
    reader.close();
    (stream as { destroy?: () => void } | undefined)?.destroy?.();
  }

  const currentBranchPath = buildCurrentBranchPath(parsedEntries);
  for (const entry of currentBranchPath) {
    const entryCwd = entry.record.cwd ?? state.cwd;
    applyPiRecord(
      state,
      entryCwd ? { ...entry.record, cwd: entryCwd } : entry.record,
      entry.sourceRef,
    );
  }

  flushCurrentPiTurn(state);

  return {
    sessionId: state.sessionId,
    provider,
    path,
    turns: state.turns,
    scoringEvents: state.scoringEvents,
    parseWarningCount,
    ...(parentSessionId ? { parentSessionId } : {}),
    ...(state.startedAt ? { startedAt: state.startedAt } : {}),
    ...(state.cwd ? { cwd: state.cwd } : {}),
  };
}
