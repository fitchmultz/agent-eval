/**
 * Purpose: Event dispatch and routing for transcript parsing.
 * Entrypoint: Used by parser to route events to appropriate handlers.
 * Notes: Routes JSONL events to specialized handlers based on event type.
 */

import type { SourceProvider } from "../schema.js";
import { handleMessageResponse } from "./message-extractor.js";
import {
  addTokenUsage,
  asFiniteNumber,
  handleSessionMetaEvent,
  handleTurnContextEvent,
} from "./session-builder.js";
import {
  handleCustomToolCallOutputResponse,
  handleCustomToolCallResponse,
  handleFunctionCallOutputResponse,
  handleFunctionCallResponse,
} from "./tool-call-handler.js";
import { asRecord, asString, getValue } from "./type-guards.js";
import type { JsonlEventRecord, ParserContext, SourceRef } from "./types.js";

/**
 * Routes response_item events to the appropriate handler based on response type.
 */
export function handleResponseItemEvent(
  payload: Record<string, unknown>,
  event: JsonlEventRecord,
  sourceRef: SourceRef,
  context: ParserContext,
): void {
  const responseType = asString(getValue(payload, "type"));

  switch (responseType) {
    case "message":
      handleMessageResponse(payload, sourceRef, context);
      break;
    case "function_call":
      handleFunctionCallResponse(payload, event, sourceRef, context);
      break;
    case "function_call_output":
      handleFunctionCallOutputResponse(payload, sourceRef, context);
      break;
    case "custom_tool_call":
      handleCustomToolCallResponse(payload, event, sourceRef, context);
      break;
    case "custom_tool_call_output":
      handleCustomToolCallOutputResponse(payload, sourceRef, context);
      break;
  }
}

/**
 * Creates a source reference for the current line.
 */
export function createSourceRef(
  provider: SourceProvider,
  path: string,
  line: number,
): SourceRef {
  return {
    provider,
    kind: provider === "opencode" ? "session_json" : "session_jsonl",
    path,
    line,
  };
}

function handleEventMessage(
  payload: Record<string, unknown>,
  context: ParserContext,
): void {
  const eventMessageType = asString(getValue(payload, "type"));
  if (eventMessageType === "turn_aborted") {
    const reason = asString(getValue(payload, "reason"));
    if (!reason || reason === "interrupted") {
      context.sessionInterruptCount = (context.sessionInterruptCount ?? 0) + 1;
    }
    return;
  }

  if (eventMessageType !== "token_count") {
    return;
  }

  const info = asRecord(getValue(payload, "info"));
  const totalTokenUsage = info
    ? asRecord(getValue(info, "total_token_usage"))
    : undefined;
  if (!totalTokenUsage) {
    return;
  }

  addTokenUsage(context, {
    inputTokens: asFiniteNumber(getValue(totalTokenUsage, "input_tokens")),
    outputTokens: asFiniteNumber(getValue(totalTokenUsage, "output_tokens")),
    totalTokens: asFiniteNumber(getValue(totalTokenUsage, "total_tokens")),
  });
}

/**
 * Routes an event to the appropriate handler based on event type.
 */
export function routeEvent(
  event: JsonlEventRecord,
  sourceRef: SourceRef,
  context: ParserContext,
): void {
  if (!event.payload) {
    return;
  }

  switch (event.type) {
    case "compacted":
      context.sessionCompactionCount =
        (context.sessionCompactionCount ?? 0) + 1;
      break;
    case "session_meta":
      handleSessionMetaEvent(event.payload, event, context);
      break;
    case "turn_context":
      handleTurnContextEvent(event.payload, event, sourceRef, context);
      break;
    case "response_item":
      handleResponseItemEvent(event.payload, event, sourceRef, context);
      break;
    case "event_msg":
      handleEventMessage(event.payload, context);
      break;
  }
}
