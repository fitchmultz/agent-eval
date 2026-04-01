/**
 * Purpose: Public exports for the transcript parsing module.
 * Entrypoint: Use `parseTranscriptFile()` for canonical session reconstruction.
 * Notes: All transcript parsing functionality is exported from here.
 */

export { parseClaudeTranscriptFile } from "./claude-parser.js";
// Event routing
export {
  createSourceRef,
  handleResponseItemEvent,
  routeEvent,
} from "./event-router.js";
// Message handling
export {
  extractMessageText,
  handleMessageResponse,
} from "./message-extractor.js";
// Main entrypoint
export {
  createParserContext,
  parseEventLine,
  parseTranscriptFile,
} from "./parser.js";
export { parsePiTranscriptFile } from "./pi-parser.js";
// Schema validation
export {
  jsonlEventRecordSchema,
  type ValidatedEventRecord,
  validateEventRecord,
  validateEventRecordStrict,
} from "./schema.js";
// Session building
export {
  buildParsedSession,
  createTurn,
  flushCurrentTurn,
  handleSessionMetaEvent,
  handleTurnContextEvent,
  hasTurnContent,
  inferSessionIdFromFilename,
} from "./session-builder.js";
// Tool call handling
export {
  handleCustomToolCallOutputResponse,
  handleCustomToolCallResponse,
  handleFunctionCallOutputResponse,
  handleFunctionCallResponse,
  normalizeToolOutput,
} from "./tool-call-handler.js";
// Type guards
export { asRecord, asString, getValue, isRecord } from "./type-guards.js";
// Types
export type {
  JsonlEventRecord,
  ParsedSession,
  ParsedToolCall,
  ParsedTurn,
  ParseOptions,
  ParserContext,
  ScoringEvent,
} from "./types.js";
