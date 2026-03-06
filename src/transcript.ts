/**
 * Purpose: Parses transcript JSONL files into normalized sessions, turns, messages, and tool activity.
 * Entrypoint: `parseTranscriptFile()` is used by the evaluator for canonical session reconstruction.
 * Notes: Supports both modern function-call events and older custom-tool-call events.
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import type { SourceRef } from "./schema.js";

export interface ParsedToolCall {
  callId: string;
  toolName: string;
  categoryHint: string;
  argumentsText?: string;
  outputText?: string;
  status: "completed" | "errored" | "unknown";
  timestamp?: string;
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
    outputText.includes("Command succeeded") ||
    outputText.includes("Process exited with code 0")
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

function createTurn(turnIndex: number): ParsedTurn {
  return {
    turnIndex,
    userMessages: [],
    assistantMessages: [],
    toolCalls: [],
    sourceRefs: [],
  };
}

export async function parseTranscriptFile(
  path: string,
): Promise<ParsedSession> {
  const content = await readFile(path, "utf8");
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const pendingToolCalls = new Map<string, ParsedToolCall>();
  const turns: ParsedTurn[] = [];
  let currentTurn = createTurn(0);
  let nextTurnIndex = 0;
  let sessionId = inferSessionIdFromFilename(path);
  let parentSessionId: string | undefined;
  let sessionStartedAt: string | undefined;
  let sessionCwd: string | undefined;

  for (const [lineIndex, line] of lines.entries()) {
    const parsedUnknown: unknown = JSON.parse(line);
    const eventRecord = asRecord(parsedUnknown);
    const event: JsonlEventRecord = {};
    const timestamp = eventRecord
      ? asString(getValue(eventRecord, "timestamp"))
      : undefined;
    const eventType = eventRecord
      ? asString(getValue(eventRecord, "type"))
      : undefined;
    const eventPayload = eventRecord
      ? asRecord(getValue(eventRecord, "payload"))
      : undefined;
    if (timestamp) {
      event.timestamp = timestamp;
    }
    if (eventType) {
      event.type = eventType;
    }
    if (eventPayload) {
      event.payload = eventPayload;
    }
    const payload = event.payload;
    const sourceRef = createSourceRef(path, lineIndex + 1);

    if (!payload) {
      continue;
    }

    switch (event.type) {
      case "session_meta": {
        sessionId = asString(getValue(payload, "id")) ?? sessionId;
        sessionStartedAt =
          asString(getValue(payload, "timestamp")) ?? event.timestamp;
        sessionCwd = asString(getValue(payload, "cwd"));
        const source = asRecord(getValue(payload, "source"));
        const subagent = source
          ? asRecord(getValue(source, "subagent"))
          : undefined;
        const threadSpawn = subagent
          ? asRecord(getValue(subagent, "thread_spawn"))
          : undefined;
        parentSessionId = threadSpawn
          ? asString(getValue(threadSpawn, "parent_thread_id"))
          : parentSessionId;
        break;
      }
      case "turn_context": {
        if (
          currentTurn.userMessages.length > 0 ||
          currentTurn.assistantMessages.length > 0 ||
          currentTurn.toolCalls.length > 0
        ) {
          turns.push(currentTurn);
          nextTurnIndex += 1;
          currentTurn = createTurn(nextTurnIndex);
        }

        const turnId = asString(getValue(payload, "turn_id"));
        const turnCwd = asString(getValue(payload, "cwd")) ?? sessionCwd;
        if (turnId) {
          currentTurn.turnId = turnId;
        }
        if (event.timestamp) {
          currentTurn.startedAt = event.timestamp;
        }
        if (turnCwd) {
          currentTurn.cwd = turnCwd;
        }
        currentTurn.sourceRefs.push(sourceRef);
        break;
      }
      case "response_item": {
        const responseType = asString(getValue(payload, "type"));
        if (!responseType) {
          break;
        }

        if (responseType === "message") {
          const role = asString(getValue(payload, "role"));
          const text = extractMessageText(payload);
          if (!text) {
            break;
          }

          if (role === "user") {
            currentTurn.userMessages.push(text);
          } else if (role === "assistant") {
            currentTurn.assistantMessages.push(text);
          }
          currentTurn.sourceRefs.push(sourceRef);
          break;
        }

        if (responseType === "function_call") {
          const callId = asString(getValue(payload, "call_id"));
          const toolName = asString(getValue(payload, "name"));
          if (!callId || !toolName) {
            break;
          }

          const toolCall: ParsedToolCall = {
            callId,
            toolName,
            categoryHint: "function_call",
            status: "unknown",
          };
          const argumentsText = asString(getValue(payload, "arguments"));
          if (argumentsText) {
            toolCall.argumentsText = argumentsText;
          }
          if (event.timestamp) {
            toolCall.timestamp = event.timestamp;
          }
          pendingToolCalls.set(callId, toolCall);
          currentTurn.toolCalls.push(toolCall);
          currentTurn.sourceRefs.push(sourceRef);
          break;
        }

        if (responseType === "function_call_output") {
          const callId = asString(getValue(payload, "call_id"));
          const outputText = asString(getValue(payload, "output"));
          if (!callId) {
            break;
          }

          const toolCall = pendingToolCalls.get(callId);
          if (toolCall && outputText) {
            toolCall.outputText = outputText;
            toolCall.status = normalizeToolOutput(outputText);
          }
          currentTurn.sourceRefs.push(sourceRef);
          break;
        }

        if (responseType === "custom_tool_call") {
          const callId = asString(getValue(payload, "call_id"));
          const toolName = asString(getValue(payload, "name"));
          if (!callId || !toolName) {
            break;
          }

          const toolCall: ParsedToolCall = {
            callId,
            toolName,
            categoryHint: "custom_tool_call",
            status:
              asString(getValue(payload, "status")) === "completed"
                ? "completed"
                : "unknown",
          };
          const inputText = asString(getValue(payload, "input"));
          if (inputText) {
            toolCall.argumentsText = inputText;
          }
          if (event.timestamp) {
            toolCall.timestamp = event.timestamp;
          }
          pendingToolCalls.set(callId, toolCall);
          currentTurn.toolCalls.push(toolCall);
          currentTurn.sourceRefs.push(sourceRef);
          break;
        }

        if (responseType === "custom_tool_call_output") {
          const callId = asString(getValue(payload, "call_id"));
          const outputText = asString(getValue(payload, "output"));
          if (!callId) {
            break;
          }

          const toolCall = pendingToolCalls.get(callId);
          if (toolCall && outputText) {
            toolCall.outputText = outputText;
            toolCall.status = normalizeToolOutput(outputText);
          }
          currentTurn.sourceRefs.push(sourceRef);
        }
        break;
      }
      default:
        break;
    }
  }

  if (
    currentTurn.userMessages.length > 0 ||
    currentTurn.assistantMessages.length > 0 ||
    currentTurn.toolCalls.length > 0
  ) {
    turns.push(currentTurn);
  }

  const parsedSession: ParsedSession = {
    sessionId,
    path,
    turns,
  };
  if (parentSessionId) {
    parsedSession.parentSessionId = parentSessionId;
  }
  if (sessionStartedAt) {
    parsedSession.startedAt = sessionStartedAt;
  }
  if (sessionCwd) {
    parsedSession.cwd = sessionCwd;
  }

  return parsedSession;
}
