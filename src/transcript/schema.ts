/**
 * Purpose: Zod schemas for validating JSONL event records from transcript files.
 * Entrypoint: Use `validateEventRecord()` for runtime validation of parsed JSON.
 * Notes: Provides strict validation to ensure transcript data conforms to expected structure.
 */

import { z } from "zod";

/**
 * Schema for a JSONL event record payload.
 * Payloads are flexible records with string keys and unknown values.
 */
export const eventPayloadSchema = z.record(z.string(), z.unknown()).optional();

/**
 * Schema for a JSONL event record.
 * Validates the structure of each line in a transcript JSONL file.
 */
export const jsonlEventRecordSchema = z.object({
  timestamp: z.string().optional(),
  type: z.string().optional(),
  payload: eventPayloadSchema,
});

/**
 * Validated type for JSONL event records.
 */
export type ValidatedEventRecord = z.infer<typeof jsonlEventRecordSchema>;

/**
 * Validates an unknown value as a JSONL event record.
 * Returns the validated record if valid, or null if invalid.
 *
 * @param value - The unknown value to validate
 * @returns Validated event record or null
 */
export function validateEventRecord(
  value: unknown,
): ValidatedEventRecord | null {
  const result = jsonlEventRecordSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * Strictly validates an unknown value as a JSONL event record.
 * Throws if validation fails.
 *
 * @param value - The unknown value to validate
 * @returns Validated event record
 * @throws z.ZodError if validation fails
 */
export function validateEventRecordStrict(
  value: unknown,
): ValidatedEventRecord {
  return jsonlEventRecordSchema.parse(value);
}
