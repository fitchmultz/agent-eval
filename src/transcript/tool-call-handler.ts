/**
 * Purpose: Normalize supported transcript tool-call events into the shared parsed-tool model.
 * Responsibilities: Create pending tool calls, update outputs, and infer completion status from tool output text.
 * Scope: Shared tool-call handling for current supported transcript event shapes.
 * Usage: Called by the event router while building parsed turns from transcript lines.
 * Invariants/Assumptions: Function-call and custom-tool-call records both remain supported because they exist in the current transcript corpus.
 */

import { extractCommandTextFromArgumentsText } from "../tool-command-text.js";
import { appendScoringEvent } from "./session-builder.js";
import { asString, getValue } from "./type-guards.js";
import type {
  JsonlEventRecord,
  ParsedToolCall,
  ParserContext,
  SourceRef,
} from "./types.js";

type ToolCallCategoryHint = "function_call" | "custom_tool_call";

function addToolCallToCurrentTurn(
  toolCall: ParsedToolCall,
  sourceRef: SourceRef,
  context: ParserContext,
): void {
  toolCall.scoringEventIndex = appendScoringEvent(context, {
    kind: "tool_call",
    toolName: toolCall.toolName,
    commandText: extractCommandTextFromArgumentsText(toolCall.argumentsText),
    status: toolCall.status,
    timestamp: toolCall.timestamp,
    cwd: context.currentTurn.cwd,
  });
  context.pendingToolCalls.set(toolCall.callId, toolCall);
  context.currentTurn.toolCalls.push(toolCall);
  context.currentTurn.sourceRefs.push(sourceRef);
}

function updateToolCallOutput(
  callId: string | undefined,
  outputText: string | undefined,
  sourceRef: SourceRef,
  context: ParserContext,
): void {
  if (!callId) {
    return;
  }

  const toolCall = context.pendingToolCalls.get(callId);
  if (toolCall && outputText) {
    toolCall.outputText = outputText;
    toolCall.status = normalizeToolOutput(outputText);
    if (typeof toolCall.scoringEventIndex === "number") {
      const scoringEvent = context.scoringEvents[toolCall.scoringEventIndex];
      if (scoringEvent) {
        context.scoringEvents[toolCall.scoringEventIndex] = {
          ...scoringEvent,
          status: toolCall.status,
        };
      }
    }
  }

  context.currentTurn.sourceRefs.push(sourceRef);
}

function buildToolCall(
  payload: Record<string, unknown>,
  event: JsonlEventRecord,
  categoryHint: ToolCallCategoryHint,
): ParsedToolCall | undefined {
  const callId = asString(getValue(payload, "call_id"));
  const toolName = asString(getValue(payload, "name"));

  if (!callId || !toolName) {
    return undefined;
  }

  const argumentsKey = categoryHint === "function_call" ? "arguments" : "input";
  const initialStatus =
    categoryHint === "custom_tool_call" &&
    asString(getValue(payload, "status")) === "completed"
      ? "completed"
      : "unknown";

  return {
    callId,
    toolName,
    categoryHint,
    status: initialStatus,
    argumentsText: asString(getValue(payload, argumentsKey)),
    timestamp: event.timestamp,
  };
}

/**
 * Normalizes tool output text to determine completion status.
 */
export function normalizeToolOutput(
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

/**
 * Handles function_call response items by creating a pending tool call.
 */
export function handleFunctionCallResponse(
  payload: Record<string, unknown>,
  event: JsonlEventRecord,
  sourceRef: SourceRef,
  context: ParserContext,
): void {
  const toolCall = buildToolCall(payload, event, "function_call");
  if (toolCall) {
    addToolCallToCurrentTurn(toolCall, sourceRef, context);
  }
}

/**
 * Handles function_call_output response items by updating the matching pending tool call.
 */
export function handleFunctionCallOutputResponse(
  payload: Record<string, unknown>,
  sourceRef: SourceRef,
  context: ParserContext,
): void {
  updateToolCallOutput(
    asString(getValue(payload, "call_id")),
    asString(getValue(payload, "output")),
    sourceRef,
    context,
  );
}

/**
 * Handles custom_tool_call response items by creating a pending tool call.
 */
export function handleCustomToolCallResponse(
  payload: Record<string, unknown>,
  event: JsonlEventRecord,
  sourceRef: SourceRef,
  context: ParserContext,
): void {
  const toolCall = buildToolCall(payload, event, "custom_tool_call");
  if (toolCall) {
    addToolCallToCurrentTurn(toolCall, sourceRef, context);
  }
}

/**
 * Handles custom_tool_call_output response items by updating the matching tool call.
 */
export function handleCustomToolCallOutputResponse(
  payload: Record<string, unknown>,
  sourceRef: SourceRef,
  context: ParserContext,
): void {
  updateToolCallOutput(
    asString(getValue(payload, "call_id")),
    asString(getValue(payload, "output")),
    sourceRef,
    context,
  );
}
