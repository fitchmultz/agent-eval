/**
 * Purpose: Centralized type guard utilities for safe type narrowing.
 * Entrypoint: Use type guards for all runtime type checking across the codebase.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function getValue(
  record: Record<string, unknown>,
  key: string,
): unknown {
  return record[key];
}
