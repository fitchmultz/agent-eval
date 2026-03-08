/**
 * Purpose: Centralized type guard utilities for safe type narrowing.
 * Entrypoint: Use type guards for all runtime type checking across the codebase.
 * Notes: All type guards return properly narrowed types without unsafe casting.
 */

/**
 * Checks if a value is a non-null object (not an array).
 * @param value - The value to check
 * @returns True if value is a Record-like object
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Converts a value to a Record if it matches the shape, otherwise undefined.
 * @param value - The value to convert
 * @returns Record or undefined
 */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

/**
 * Checks if a value is a non-empty string.
 * @param value - The value to check
 * @returns True if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Converts a value to a non-empty string if valid, otherwise undefined.
 * @param value - The value to convert
 * @returns Non-empty string or undefined
 */
export function asString(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value : undefined;
}

/**
 * Safely retrieves a value from a record by key.
 * @param record - The record to access
 * @param key - The key to look up
 * @returns The value or undefined if key doesn't exist
 */
export function getValue(
  record: Record<string, unknown>,
  key: string,
): unknown {
  return record[key];
}

/**
 * Checks if a value is a valid number (not NaN, Infinity, or -Infinity).
 * @param value - The value to check
 * @returns True if value is a finite number
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Checks if a value is an array.
 * @param value - The value to check
 * @returns True if value is an array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Checks if a value is null or undefined.
 * @param value - The value to check
 * @returns True if value is nullish
 */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Checks if a value is defined (not null or undefined).
 * @param value - The value to check
 * @returns True if value is defined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard for checking if a value has a specific property.
 * @param value - The value to check
 * @param property - The property name to check for
 * @returns True if the value has the property
 */
export function hasProperty<K extends string>(
  value: unknown,
  property: K,
): value is Record<K, unknown> {
  return isRecord(value) && property in value;
}

/**
 * Type guard for checking if a value has a string property.
 * @param value - The value to check
 * @param property - The property name to check for
 * @returns True if the value has the property and it's a string
 */
export function hasStringProperty<K extends string>(
  value: unknown,
  property: K,
): value is Record<K, string> {
  return hasProperty(value, property) && typeof value[property] === "string";
}
