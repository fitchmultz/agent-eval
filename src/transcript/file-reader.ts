/**
 * Purpose: File I/O wrapper for transcript parsing.
 * Responsibilities: Provide line-by-line JSONL reading with typed stream access for cleanup.
 * Scope: Shared by Codex, Claude, and pi transcript parsers.
 * Usage: Create a reader with `createTranscriptLineReader()` and close its stream with `getReaderStream()`.
 * Invariants/Assumptions: Underlying readline instances expose either `input` or `_inputStream`.
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
): NodeJS.ReadableStream | undefined {
  const readerWithStream = reader as readline.Interface & {
    input?: NodeJS.ReadableStream;
    _inputStream?: NodeJS.ReadableStream;
  };

  return readerWithStream.input ?? readerWithStream._inputStream;
}
