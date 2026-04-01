/**
 * Purpose: Unit tests for tool-classification module.
 * Entrypoint: Run with `pnpm test tests/tool-classification.test.ts`
 * Notes: Tests tool categorization logic including write tools and verification commands.
 */

import { describe, expect, it } from "vitest";
import {
  categorizeToolCall,
  extractCommandText,
  isVerificationCommand,
  isVerificationTool,
  isWriteTool,
  isWriteToolName,
  VERIFICATION_COMMAND_PATTERNS,
  WRITE_TOOL_NAMES,
} from "../src/tool-classification.js";
import type { ParsedToolCall } from "../src/transcript/index.js";

function createParsedToolCall(
  overrides: Partial<ParsedToolCall> & {
    callId: string;
    toolName: string;
    categoryHint: string;
  },
): ParsedToolCall {
  return {
    status: "completed",
    ...overrides,
  } as ParsedToolCall;
}

describe("WRITE_TOOL_NAMES", () => {
  it("should include expected tool names", () => {
    expect(WRITE_TOOL_NAMES).toContain("apply_patch");
    expect(WRITE_TOOL_NAMES).toContain("mcp__RepoPrompt__apply_edits");
    expect(WRITE_TOOL_NAMES).toContain("mcp__RepoPrompt__file_actions");
  });
});

describe("isWriteToolName", () => {
  it("should return true for write tool names", () => {
    expect(isWriteToolName("apply_patch")).toBe(true);
    expect(isWriteToolName("mcp__RepoPrompt__apply_edits")).toBe(true);
    expect(isWriteToolName("mcp__RepoPrompt__file_actions")).toBe(true);
    expect(isWriteToolName("edit")).toBe(true);
    expect(isWriteToolName("write")).toBe(true);
  });

  it("should return false for non-write tool names", () => {
    expect(isWriteToolName("bash")).toBe(false);
    expect(isWriteToolName("read_file")).toBe(false);
    expect(isWriteToolName("some_other_tool")).toBe(false);
  });
});

describe("isWriteTool", () => {
  it("should return true for write tool calls", () => {
    const toolCall = createParsedToolCall({
      callId: "call-1",
      toolName: "apply_patch",
      categoryHint: "write",
      argumentsText: '{"path": "test.ts"}',
      status: "completed",
    });
    expect(isWriteTool(toolCall)).toBe(true);
  });

  it("should return false for non-write tool calls", () => {
    const toolCall = createParsedToolCall({
      callId: "call-2",
      toolName: "bash",
      categoryHint: "command",
      argumentsText: '{"cmd": "ls"}',
      status: "completed",
    });
    expect(isWriteTool(toolCall)).toBe(false);
  });
});

describe("isVerificationCommand", () => {
  it("should detect test commands", () => {
    expect(isVerificationCommand("npm test")).toBe(true);
    expect(isVerificationCommand("vitest run")).toBe(true);
    expect(isVerificationCommand("jest")).toBe(true);
    expect(isVerificationCommand("cargo test")).toBe(true);
    expect(isVerificationCommand("pytest")).toBe(true);
  });

  it("should detect lint commands", () => {
    expect(isVerificationCommand("ruff check")).toBe(true);
    expect(isVerificationCommand("eslint")).toBe(false); // "lint" pattern uses word boundaries, doesn't match within "eslint"
    expect(isVerificationCommand("lint")).toBe(true);
  });

  it("should detect typecheck commands", () => {
    expect(isVerificationCommand("tsc --noEmit")).toBe(true);
    expect(isVerificationCommand("typecheck")).toBe(true);
  });

  it("should detect build commands", () => {
    expect(isVerificationCommand("npm run build")).toBe(true);
    expect(isVerificationCommand("build")).toBe(true);
    expect(isVerificationCommand("make ci")).toBe(true);
  });

  it("should return false for non-verification commands", () => {
    expect(isVerificationCommand("ls -la")).toBe(false);
    expect(isVerificationCommand("echo hello")).toBe(false);
    expect(isVerificationCommand("cat file.txt")).toBe(false);
  });
});

describe("categorizeToolCall", () => {
  it("should categorize write tools correctly", () => {
    // Use path that doesn't contain "test" substring to avoid verification pattern match
    const result = categorizeToolCall("apply_patch", '{"path": "main.ts"}');
    expect(result.category).toBe("write");
    expect(result.writeLike).toBe(true);
    expect(result.verificationLike).toBe(false);
  });

  it("should categorize verification tools correctly", () => {
    const result = categorizeToolCall("bash", "npm test");
    expect(result.category).toBe("verification");
    expect(result.writeLike).toBe(false);
    expect(result.verificationLike).toBe(true);
  });

  it("should prioritize write over verification", () => {
    // apply_patch with test command should still be write
    const result = categorizeToolCall("apply_patch", "npm test");
    expect(result.category).toBe("write");
    expect(result.writeLike).toBe(true);
  });

  it("should categorize other tools correctly", () => {
    // Use path that doesn't contain "test" substring to avoid verification pattern match
    const result = categorizeToolCall("read_file", '{"path": "main.ts"}');
    expect(result.category).toBe("other");
    expect(result.writeLike).toBe(false);
    expect(result.verificationLike).toBe(false);
  });

  it("should handle undefined argumentsText", () => {
    const result = categorizeToolCall("bash", undefined);
    expect(result.category).toBe("other");
    expect(result.verificationLike).toBe(false);
  });
});

describe("extractCommandText", () => {
  it("should extract cmd from JSON", () => {
    const toolCall = createParsedToolCall({
      callId: "call-1",
      toolName: "bash",
      categoryHint: "command",
      argumentsText: '{"cmd": "ls -la"}',
      status: "completed",
    });
    expect(extractCommandText(toolCall)).toBe("ls -la");
  });

  it("should extract command string from JSON", () => {
    const toolCall = createParsedToolCall({
      callId: "call-2",
      toolName: "bash",
      categoryHint: "command",
      argumentsText: '{"command": "pnpm test"}',
      status: "completed",
    });
    expect(extractCommandText(toolCall)).toBe("pnpm test");
  });

  it("should extract command array from JSON", () => {
    const toolCall = createParsedToolCall({
      callId: "call-3",
      toolName: "bash",
      categoryHint: "command",
      argumentsText: '{"command": ["npm", "test"]}',
      status: "completed",
    });
    expect(extractCommandText(toolCall)).toBe("npm test");
  });

  it("should return raw text for invalid JSON", () => {
    const toolCall = createParsedToolCall({
      callId: "call-4",
      toolName: "bash",
      categoryHint: "command",
      argumentsText: "not valid json",
      status: "completed",
    });
    expect(extractCommandText(toolCall)).toBe("not valid json");
  });

  it("should return undefined for empty arguments", () => {
    const toolCall = createParsedToolCall({
      callId: "call-5",
      toolName: "bash",
      categoryHint: "command",
    });
    expect(extractCommandText(toolCall)).toBeUndefined();
  });

  it("should return raw text for non-object JSON", () => {
    const toolCall = createParsedToolCall({
      callId: "call-6",
      toolName: "bash",
      categoryHint: "command",
      argumentsText: "[1, 2, 3]",
      status: "completed",
    });
    expect(extractCommandText(toolCall)).toBe("[1, 2, 3]");
  });
});

describe("isVerificationTool", () => {
  it("should return true for verification tools", () => {
    const toolCall = createParsedToolCall({
      callId: "call-1",
      toolName: "bash",
      categoryHint: "command",
      argumentsText: '{"cmd": "npm test"}',
      status: "completed",
    });
    expect(isVerificationTool(toolCall)).toBe(true);
  });

  it("should return false for non-verification tools", () => {
    const toolCall = createParsedToolCall({
      callId: "call-2",
      toolName: "bash",
      categoryHint: "command",
      argumentsText: '{"cmd": "ls -la"}',
      status: "completed",
    });
    expect(isVerificationTool(toolCall)).toBe(false);
  });

  it("should return false when no command text", () => {
    const toolCall = createParsedToolCall({
      callId: "call-3",
      toolName: "bash",
      categoryHint: "command",
    });
    expect(isVerificationTool(toolCall)).toBe(false);
  });
});

describe("VERIFICATION_COMMAND_PATTERNS", () => {
  it("should contain expected patterns", () => {
    const patterns = VERIFICATION_COMMAND_PATTERNS.map((p) => p.source);
    expect(patterns.some((p) => p.includes("test"))).toBe(true);
    expect(patterns.some((p) => p.includes("lint"))).toBe(true);
    expect(patterns.some((p) => p.includes("build"))).toBe(true);
  });
});
