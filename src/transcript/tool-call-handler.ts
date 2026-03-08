/**
 * Purpose: Tool call processing for transcript parsing.
 * Entrypoint: Used by event-router to handle function calls and outputs.
 * Notes: Handles both modern function_call and legacy custom_tool_call formats.
 */

import { asRecord, asString, getValue } from "./type-guards.js";
import type { JsonlEventRecord, ParsedToolCall, ParserContext, SourceRef } from "./types.js";

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
