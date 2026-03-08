/**
 * Purpose: Event dispatch and routing for transcript parsing.
 * Entrypoint: Used by parser to route events to appropriate handlers.
 * Notes: Routes JSONL events to specialized handlers based on event type.
 */

import { handleMessageResponse } from "./message-extractor.js";
import {
  handleSessionMetaEvent,
  handleTurnContextEvent,
} from "./session-builder.js";
import {
  handleCustomToolCallOutputResponse,
  handleCustomToolCallResponse,
  handleFunctionCallOutputResponse,
  handleFunctionCallResponse,
} from "./tool-call-handler.js";
import { asString, getValue } from "./type-guards.js";
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
export function createSourceRef(path: string, line: number): SourceRef {
  return {
    kind: "session_jsonl",
    path,
    line,
  };
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
    case "session_meta":
      handleSessionMetaEvent(event.payload, event, context);
      break;
    case "turn_context":
      handleTurnContextEvent(event.payload, event, sourceRef, context);
      break;
    case "response_item":
      handleResponseItemEvent(event.payload, event, sourceRef, context);
      break;
  }
}
