/**
 * Purpose: Public exports for the transcript parsing module.
 * Entrypoint: Use `parseTranscriptFile()` for canonical session reconstruction.
 * Notes: All transcript parsing functionality is exported from here.
 */

// Main entrypoint
export { parseTranscriptFile, parseEventLine, createParserContext } from "./parser.js";

// Types
export type {
  ParsedToolCall,
  ParsedTurn,
  ParsedSession,
  ParseOptions,
  ParserContext,
  JsonlEventRecord,
} from "./types.js";

// Session building
export {
  createTurn,
  hasTurnContent,
  buildParsedSession,
  handleSessionMetaEvent,
  handleTurnContextEvent,
  flushCurrentTurn,
  inferSessionIdFromFilename,
} from "./session-builder.js";

// Event routing
export {
  handleResponseItemEvent,
  createSourceRef,
  routeEvent,
} from "./event-router.js";

// Message handling
export { handleMessageResponse, extractMessageText } from "./message-extractor.js";

// Tool call handling
export {
  handleFunctionCallResponse,
  handleFunctionCallOutputResponse,
  handleCustomToolCallResponse,
  handleCustomToolCallOutputResponse,
  normalizeToolOutput,
} from "./tool-call-handler.js";

// Type guards
export { isRecord, asRecord, asString, getValue } from "./type-guards.js";
