/**
 * Purpose: Provides centralized tool classification logic for write tools and verification commands.
 * Entrypoint: Use `isWriteToolName()`, `isVerificationCommand()`, and `categorizeToolCall()` for consistent categorization.
 * Notes: Centralizes tool classification to eliminate duplication between compliance scoring and evaluation.
 */

import type { ParsedToolCall } from "./transcript/index.js";

/**
 * Tool names that perform write operations on files.
 * These tools modify code, configuration, or file content.
 */
export const WRITE_TOOL_NAMES = [
  "apply_patch",
  "mcp__RepoPrompt__apply_edits",
  "mcp__RepoPrompt__file_actions",
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

/**
 * Categorizes a tool call based on its name and optional arguments.
 * Returns a comprehensive categorization including category and boolean flags.
 * @param toolName - The name of the tool
 * @param argumentsText - Optional command text from tool arguments
 * @returns Categorization result with category and boolean flags
 */
export function categorizeToolCall(
  toolName: string,
  argumentsText?: string,
): {
  category: "write" | "verification" | "other";
  writeLike: boolean;
  verificationLike: boolean;
} {
  const writeLike = isWriteToolName(toolName);
  const verificationLike = argumentsText
    ? isVerificationCommand(argumentsText)
    : false;
  return {
    category: writeLike ? "write" : verificationLike ? "verification" : "other",
    writeLike,
    verificationLike,
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
 * @param toolCall - The parsed tool call
 * @returns The extracted command text or undefined if not found
 */
export function extractCommandText(
  toolCall: ParsedToolCall,
): string | undefined {
  const payloadText = toolCall.argumentsText;
  if (!payloadText) {
    return undefined;
  }

  try {
    const parsedUnknown: unknown = JSON.parse(payloadText);
    if (
      typeof parsedUnknown !== "object" ||
      parsedUnknown === null ||
      Array.isArray(parsedUnknown)
    ) {
      return payloadText;
    }

    if (!isStringRecord(parsedUnknown)) {
      return payloadText;
    }

    const parsed = parsedUnknown;
    const commandKey = "command";
    const cmdKey = "cmd";
    const cmd = parsed[cmdKey];
    const command = parsed[commandKey];
    if (typeof cmd === "string") {
      return cmd;
    }
    if (Array.isArray(command)) {
      return command.filter((item) => typeof item === "string").join(" ");
    }
  } catch {
    return payloadText;
  }

  return undefined;
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
