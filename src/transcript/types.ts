/**
 * Purpose: Type definitions for transcript parsing.
 * Entrypoint: Used by all transcript parsing modules.
 * Notes: Centralized type definitions to avoid circular dependencies.
 */

import type { SourceRef as SchemaSourceRef } from "../schema.js";

// Re-export for convenience
export type SourceRef = SchemaSourceRef;

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

export interface JsonlEventRecord {
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
  /** Maximum time to wait for file parsing (milliseconds). Default: 30000 (30 seconds) */
  timeoutMs?: number;
  /** Signal to abort parsing */
  signal?: AbortSignal | undefined;
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
