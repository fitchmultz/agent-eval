/**
 * Purpose: Shared type guard utilities for transcript parsing.
 * Entrypoint: Used by all transcript parsing modules for safe type narrowing.
 * Notes: Centralized type guards to ensure consistent validation.
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

export function getValue(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}
