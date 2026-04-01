/**
 * Purpose: Centralizes source-provider definitions and home/path helpers for supported agent transcript stores.
 * Responsibilities: Define supported providers, resolve default homes, detect providers from paths, and support source-aware UX.
 * Scope: Shared by discovery, CLI, parsers, and report formatting.
 * Usage: Import helpers like `detectSourceProviderFromPath()` and `getDefaultSourceHome()`.
 * Invariants/Assumptions: Supported providers are currently limited to `codex`, `claude`, and `pi`.
 */

import { join } from "node:path";

export const sourceProviderValues = ["codex", "claude", "pi"] as const;

export type SourceProvider = (typeof sourceProviderValues)[number];

export interface SourceDescriptor {
  provider: SourceProvider;
  label: string;
  defaultHomeDirname: `.${string}`;
}

export const SOURCE_DESCRIPTORS: Record<SourceProvider, SourceDescriptor> = {
  codex: {
    provider: "codex",
    label: "Codex",
    defaultHomeDirname: ".codex",
  },
  claude: {
    provider: "claude",
    label: "Claude Code",
    defaultHomeDirname: ".claude",
  },
  pi: {
    provider: "pi",
    label: "pi",
    defaultHomeDirname: ".pi",
  },
};

export function isSourceProvider(value: string): value is SourceProvider {
  return sourceProviderValues.includes(value as SourceProvider);
}

export function getDefaultSourceHome(
  provider: SourceProvider,
  homeDirectory: string,
): string {
  return join(homeDirectory, SOURCE_DESCRIPTORS[provider].defaultHomeDirname);
}

export function detectSourceProviderFromPath(
  path: string,
): SourceProvider | undefined {
  if (path.includes("/.codex/") || path.endsWith("/.codex")) {
    return "codex";
  }

  if (path.includes("/.claude/") || path.endsWith("/.claude")) {
    return "claude";
  }

  if (path.includes("/.pi/") || path.endsWith("/.pi")) {
    return "pi";
  }

  return undefined;
}

export function getSourceLabel(provider: SourceProvider): string {
  return SOURCE_DESCRIPTORS[provider].label;
}
