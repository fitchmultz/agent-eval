/**
 * Purpose: Session construction utilities for transcript parsing.
 * Entrypoint: Used by parser to build final ParsedSession from context.
 * Notes: Handles session metadata extraction and final session assembly.
 */

import { basename } from "node:path";
import { asRecord, asString, getValue } from "./type-guards.js";
import type {
  JsonlEventRecord,
  ParsedSession,
  ParsedTurn,
  ParserContext,
  ScoringEvent,
  SourceRef,
} from "./types.js";

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Creates a new empty turn with the given index.
 */
export function createTurn(turnIndex: number): ParsedTurn {
  return {
    turnIndex,
    userMessages: [],
    assistantMessages: [],
    toolCalls: [],
    sourceRefs: [],
  };
}

/**
 * Appends an ordered scoring event to the parser context.
 */
export function appendScoringEvent(
  context: Pick<
    ParserContext,
    "currentTurn" | "nextScoringSequenceIndex" | "scoringEvents" | "sessionId"
  >,
  event: Omit<ScoringEvent, "sequenceIndex" | "sessionId" | "turnIndex"> & {
    turnIndex?: number;
  },
): number {
  const sequenceIndex = context.nextScoringSequenceIndex;
  context.scoringEvents.push({
    sessionId: context.sessionId,
    turnIndex: event.turnIndex ?? context.currentTurn.turnIndex,
    sequenceIndex,
    timestamp: event.timestamp,
    cwd: event.cwd,
    kind: event.kind,
    text: event.text,
    toolName: event.toolName,
    commandText: event.commandText,
    status: event.status,
  });
  context.nextScoringSequenceIndex += 1;
  return sequenceIndex;
}

/**
 * Checks if a turn has any content (messages or tool calls).
 */
export function hasTurnContent(turn: ParsedTurn): boolean {
  return (
    turn.userMessages.length > 0 ||
    turn.assistantMessages.length > 0 ||
    turn.toolCalls.length > 0
  );
}

/**
 * Flushes the current turn to the turns array if it has content,
 * then initializes a new current turn.
 */
export function flushCurrentTurn(context: ParserContext): void {
  if (!hasTurnContent(context.currentTurn)) {
    return;
  }
  context.turns.push(context.currentTurn);
  context.nextTurnIndex += 1;
  context.currentTurn = createTurn(context.nextTurnIndex);
}

/**
 * Infers session ID from the filename.
 * Extracts the last 5 hyphen-separated parts from the filename.
 */
export function inferSessionIdFromFilename(path: string): string {
  const filename = basename(path, ".jsonl");
  const parts = filename.split("-");
  return parts.slice(-5).join("-");
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
  if (!context.sessionMetaSeen) {
    context.sessionId = asString(getValue(payload, "id")) ?? context.sessionId;
    context.sessionMetaSeen = true;
  }
  context.sessionHarness ??= "codex";

  const startedAt = asString(getValue(payload, "timestamp")) ?? event.timestamp;
  if (startedAt) {
    context.sessionStartedAt ??= startedAt;
  }

  const cwd = asString(getValue(payload, "cwd"));
  if (cwd) {
    context.sessionCwd ??= cwd;
  }

  const modelProvider =
    asString(getValue(payload, "modelProvider")) ??
    asString(getValue(payload, "model_provider"));
  if (modelProvider) {
    context.sessionModelProvider ??= modelProvider;
  }

  const model =
    asString(getValue(payload, "model")) ??
    asString(getValue(payload, "modelId"));
  if (model) {
    context.sessionModel ??= model;
  }

  const inputTokens =
    asNumber(getValue(payload, "inputTokens")) ??
    asNumber(getValue(payload, "input_tokens"));
  if (typeof inputTokens === "number") {
    context.sessionInputTokens ??= inputTokens;
  }

  const outputTokens =
    asNumber(getValue(payload, "outputTokens")) ??
    asNumber(getValue(payload, "output_tokens"));
  if (typeof outputTokens === "number") {
    context.sessionOutputTokens ??= outputTokens;
  }

  const totalTokens =
    asNumber(getValue(payload, "totalTokens")) ??
    asNumber(getValue(payload, "total_tokens"));
  if (typeof totalTokens === "number") {
    context.sessionTotalTokens ??= totalTokens;
  }

  const compactionCount =
    asNumber(getValue(payload, "compactionCount")) ??
    asNumber(getValue(payload, "compaction_count"));
  if (typeof compactionCount === "number") {
    context.sessionCompactionCount ??= compactionCount;
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
    context.parentSessionId ??= parentId;
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
 * Builds the final ParsedSession from the parser context.
 */
export function buildParsedSession(
  context: ParserContext,
  path: string,
  provider: ParsedSession["provider"],
): ParsedSession {
  if (hasTurnContent(context.currentTurn)) {
    context.turns.push(context.currentTurn);
  }

  const parsedSession: ParsedSession = {
    sessionId: context.sessionId,
    provider,
    path,
    turns: context.turns,
    scoringEvents: context.scoringEvents,
  };

  if (context.parentSessionId) {
    parsedSession.parentSessionId = context.parentSessionId;
  }
  if (context.sessionStartedAt) {
    parsedSession.startedAt = context.sessionStartedAt;
  }
  if (context.sessionEndedAt) {
    parsedSession.endedAt = context.sessionEndedAt;
  }
  if (context.sessionCwd) {
    parsedSession.cwd = context.sessionCwd;
  }
  if (context.sessionHarness) {
    parsedSession.harness = context.sessionHarness;
  }
  if (context.sessionModelProvider) {
    parsedSession.modelProvider = context.sessionModelProvider;
  }
  if (context.sessionModel) {
    parsedSession.model = context.sessionModel;
  }
  if (typeof context.sessionInputTokens === "number") {
    parsedSession.inputTokens = context.sessionInputTokens;
  }
  if (typeof context.sessionOutputTokens === "number") {
    parsedSession.outputTokens = context.sessionOutputTokens;
  }
  if (typeof context.sessionTotalTokens === "number") {
    parsedSession.totalTokens = context.sessionTotalTokens;
  }
  if (typeof context.sessionCompactionCount === "number") {
    parsedSession.compactionCount = context.sessionCompactionCount;
  }

  return parsedSession;
}
