/**
 * Purpose: Type definitions for transcript parsing.
 * Responsibilities: Define normalized parsed-session shapes shared by source-specific parsers.
 * Scope: Used by all transcript parsing modules and downstream evaluation code.
 * Usage: Import parsed transcript types from this module instead of redefining source-specific variants.
 * Invariants/Assumptions: Parsed sessions normalize Codex and Claude Code into the same turn/tool/message model.
 */

import type {
  SourceRef as SchemaSourceRef,
  SourceProvider,
} from "../schema.js";

// Re-export for convenience
export type SourceRef = SchemaSourceRef;

export interface ScoringEvent {
  sessionId: string;
  turnIndex: number;
  sequenceIndex: number;
  timestamp?: string | undefined;
  cwd?: string | undefined;
  kind: "user_message" | "assistant_message" | "tool_call";
  text?: string | undefined;
  toolName?: string | undefined;
  commandText?: string | undefined;
  status?: "completed" | "errored" | "unknown" | undefined;
}

export interface ParsedToolCall {
  callId: string;
  toolName: string;
  categoryHint: string;
  argumentsText?: string | undefined;
  outputText?: string | undefined;
  status: "completed" | "errored" | "unknown";
  timestamp?: string | undefined;
  scoringEventIndex?: number | undefined;
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
  provider: SourceProvider;
  parentSessionId?: string;
  path: string;
  startedAt?: string;
  cwd?: string;
  turns: ParsedTurn[];
  scoringEvents?: ScoringEvent[] | undefined;
  parseWarningCount?: number | undefined;
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
  /** Explicit source provider. When omitted, the parser infers it from the transcript path. */
  sourceProvider?: SourceProvider;
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
  scoringEvents: ScoringEvent[];
  nextScoringSequenceIndex: number;
  pendingToolCalls: Map<string, ParsedToolCall>;
  lineNumber: number;
}
