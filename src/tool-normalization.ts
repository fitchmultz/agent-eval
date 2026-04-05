/**
 * Purpose: Deterministically normalize transcript-visible tool identities into compact tool-family facts.
 * Responsibilities: Provide shared normalized tool names, family mapping, and MCP extraction.
 * Scope: Used by session processing and classification only; it never inspects raw transcript bodies beyond tool names.
 * Usage: Call `normalizeToolIdentity(toolName)` for any normalized ParsedToolCall or ToolCallSummary path.
 * Invariants/Assumptions: Normalization stays lexical and deterministic; deeper attribution or template inference is out of scope.
 */

export type ToolFamily =
  | "write"
  | "verification"
  | "shell"
  | "read"
  | "search"
  | "mcp"
  | "other";

export interface NormalizedToolIdentity {
  normalizedToolName: string;
  toolFamily: ToolFamily;
  isMcp: boolean;
  mcpServer?: string;
  mcpToolName?: string;
}

const SHELL_TOOL_NAMES = new Set(["bash", "exec_command", "shell"]);
const READ_TOOL_NAMES = new Set(["read", "view", "open_file"]);
const SEARCH_TOOL_NAMES = new Set([
  "grep",
  "rg",
  "search",
  "glob",
  "find",
  "ls",
]);

function normalizeCase(toolName: string): string {
  return toolName.trim();
}

function parseMcpToolName(toolName: string): {
  server: string;
  tool: string;
} | null {
  const match = /^mcp__([^_][^_]*)__([^\s]+)$/.exec(toolName);
  if (!match) {
    return null;
  }

  const [, server, tool] = match;
  if (!server || !tool) {
    return null;
  }

  return { server, tool };
}

export function normalizeToolIdentity(
  toolName: string,
): NormalizedToolIdentity {
  const normalized = normalizeCase(toolName);
  const mcp = parseMcpToolName(normalized);
  if (mcp) {
    return {
      normalizedToolName: `${mcp.server}/${mcp.tool}`,
      toolFamily: "mcp",
      isMcp: true,
      mcpServer: mcp.server,
      mcpToolName: mcp.tool,
    };
  }

  const lower = normalized.toLowerCase();
  if (SHELL_TOOL_NAMES.has(lower)) {
    return {
      normalizedToolName: lower,
      toolFamily: "shell",
      isMcp: false,
    };
  }

  if (READ_TOOL_NAMES.has(lower)) {
    return {
      normalizedToolName: lower,
      toolFamily: "read",
      isMcp: false,
    };
  }

  if (SEARCH_TOOL_NAMES.has(lower)) {
    return {
      normalizedToolName: lower,
      toolFamily: "search",
      isMcp: false,
    };
  }

  return {
    normalizedToolName: lower,
    toolFamily: "other",
    isMcp: false,
  };
}
