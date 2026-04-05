/**
 * Purpose: Provides centralized tool classification logic for write tools, verification commands, and normalized tool families.
 * Entrypoint: Use `isWriteToolName()`, `isVerificationCommand()`, `categorizeToolCall()`, and `extractCommandText()` for consistent categorization.
 * Notes: Centralizes tool classification to eliminate duplication between compliance scoring, metrics aggregation, and session-facts generation.
 */

import { extractCommandTextFromArgumentsText } from "./tool-command-text.js";
import {
  normalizeToolIdentity,
  type ToolFamily,
} from "./tool-normalization.js";
import type { ParsedToolCall } from "./transcript/index.js";

/**
 * Tool names that perform write operations on files.
 * These tools modify code, configuration, or file content across supported agents.
 */
export const WRITE_TOOL_NAMES = [
  "apply_patch",
  "mcp__RepoPrompt__apply_edits",
  "mcp__RepoPrompt__file_actions",
  "Edit",
  "MultiEdit",
  "Write",
  "edit",
  "write",
] as const;

/**
 * Regex patterns used to detect verification/test commands in tool arguments.
 * Matches common testing and validation commands across various languages and tools.
 */
export const VERIFICATION_COMMAND_PATTERNS = [
  /\b(test|vitest|jest|cargo test|pytest|ruff|lint|typecheck|tsc|build|make ci)\b/i,
] as const;

/**
 * Determines if a tool name represents a write operation.
 * @param toolName - The name of the tool to check
 * @returns True if the tool performs write operations
 */
export function isWriteToolName(toolName: string): boolean {
  return WRITE_TOOL_NAMES.includes(
    toolName as (typeof WRITE_TOOL_NAMES)[number],
  );
}

/**
 * Checks if a command text contains verification-related patterns.
 * @param text - The command text to analyze
 * @returns True if the text matches verification command patterns
 */
export function isVerificationCommand(text: string): boolean {
  return VERIFICATION_COMMAND_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Determines if a tool call is a write tool.
 * Convenience wrapper that works with ParsedToolCall objects.
 * @param toolCall - The parsed tool call to check
 * @returns True if the tool performs write operations
 */
export function isWriteTool(toolCall: ParsedToolCall): boolean {
  return isWriteToolName(toolCall.toolName);
}

export interface ToolCallCategorization {
  category: "write" | "verification" | "other";
  writeLike: boolean;
  verificationLike: boolean;
  normalizedToolName: string;
  toolFamily: ToolFamily;
  isMcp: boolean;
  mcpServer?: string;
  mcpToolName?: string;
}

/**
 * Categorizes a tool call based on its name and optional arguments.
 * Returns a comprehensive categorization including category, booleans, and normalized identity.
 * @param toolName - The name of the tool
 * @param argumentsText - Optional command text from tool arguments
 * @returns Categorization result with category and boolean flags
 */
export function categorizeToolCall(
  toolName: string,
  argumentsText?: string,
): ToolCallCategorization {
  const writeLike = isWriteToolName(toolName);
  const verificationLike = argumentsText
    ? isVerificationCommand(argumentsText)
    : false;
  const normalized = normalizeToolIdentity(toolName);

  return {
    category: writeLike ? "write" : verificationLike ? "verification" : "other",
    writeLike,
    verificationLike,
    normalizedToolName: normalized.normalizedToolName,
    toolFamily: writeLike
      ? "write"
      : verificationLike
        ? "verification"
        : normalized.toolFamily,
    isMcp: normalized.isMcp,
    ...(normalized.mcpServer ? { mcpServer: normalized.mcpServer } : {}),
    ...(normalized.mcpToolName ? { mcpToolName: normalized.mcpToolName } : {}),
  };
}

/**
 * Checks if a tool call represents a verification operation.
 * Inspects the command text extracted from tool arguments to determine
 * if this is a test, lint, typecheck, or build verification command.
 * @param toolCall - The parsed tool call to check
 * @returns True if the tool call is a verification command
 */
export function isVerificationTool(toolCall: ParsedToolCall): boolean {
  const commandText = extractCommandText(toolCall);
  if (!commandText) {
    return false;
  }
  return isVerificationCommand(commandText);
}

/**
 * Extracts command text from a tool call's arguments.
 * Attempts to parse JSON arguments and extract command/cmd fields.
 * Falls back to returning the raw payload text if parsing fails.
 *
 * @param toolCall - The parsed tool call
 * @returns The extracted command text or undefined if not found
 */
export function extractCommandText(
  toolCall: ParsedToolCall,
): string | undefined {
  return extractCommandTextFromArgumentsText(toolCall.argumentsText);
}
