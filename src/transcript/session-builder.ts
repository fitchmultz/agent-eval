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
  SourceRef,
} from "./types.js";

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
