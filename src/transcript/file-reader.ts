/**
 * Purpose: File I/O wrapper for transcript parsing.
 * Entrypoint: Used by parser to read JSONL transcript files.
 * Notes: Provides line-by-line reading with proper resource cleanup.
 */

import { createReadStream } from "node:fs";
import * as readline from "node:readline";

/**
 * Creates a line reader for a transcript file.
 * Returns an async iterable that yields each line.
 */
export function createTranscriptLineReader(path: string): readline.Interface {
  const stream = createReadStream(path, { encoding: "utf8" });
  return readline.createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });
}

/**
 * Gets the underlying stream from a line reader for cleanup.
 */
export function getReaderStream(
  reader: readline.Interface,
): NodeJS.ReadableStream {
  // The reader has a private _inputStream property we need to access for cleanup
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (reader as any).input || (reader as any)._inputStream;
}
