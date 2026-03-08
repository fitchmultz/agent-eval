/**
 * Purpose: Provides concurrency primitives for parallel async operations.
 * Entrypoint: `mapWithConcurrency()` for bounded parallel processing of async operations.
 * Notes: Generic utility for executing async work with controlled concurrency limits.
 *        All workers are wrapped in try/catch to aggregate errors with context.
 */

import { normalizeError } from "../errors.js";
import { throwIfAborted } from "./abort.js";

/**
 * Error thrown when one or more concurrent workers fail.
 * Aggregates all individual worker errors with their context.
 */
export class ConcurrencyError extends Error {
  constructor(
    public readonly errors: ReadonlyArray<{
      index: number;
      error: Error;
    }>,
  ) {
    super(
      `Concurrent processing failed with ${errors.length} error(s): ${errors
        .map((e) => `[index ${e.index}] ${e.error.message}`)
        .join("; ")}`,
    );
    this.name = "ConcurrencyError";
  }
}

/**
 * Maps an array of items to results using async workers with a concurrency limit.
 * Maintains order of results matching the input array order.
 * All workers are wrapped in try/catch to ensure proper error handling.
 * Supports cancellation via optional AbortSignal.
 *
 * @param items - Array of items to process
 * @param concurrency - Maximum number of concurrent workers
 * @param worker - Async function to process each item
 * @param signal - Optional AbortSignal for cancellation
 * @returns Array of results in the same order as input items
 * @throws ConcurrencyError if any worker fails, aggregating all errors with context
 * @throws DOMException with name "AbortError" if signal is aborted
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  // Use a Map instead of sparse array to avoid undefined gaps
  const results = new Map<number, R>();
  const errors: Array<{ index: number; error: Error }> = [];
  let nextIndex = 0;
  let completedCount = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      // Check for abort signal before picking up next item
      throwIfAborted(signal);

      const currentIndex = nextIndex;
      nextIndex += 1;
      const item = items[currentIndex];
      if (item === undefined) {
        return;
      }

      try {
        const result = await worker(item, currentIndex);
        results.set(currentIndex, result);
        completedCount += 1;
      } catch (error) {
        const normalizedError = normalizeError(error);
        errors.push({ index: currentIndex, error: normalizedError });
        completedCount += 1;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () =>
      runWorker(),
    ),
  );

  // If any errors occurred, throw aggregated error with context
  if (errors.length > 0) {
    throw new ConcurrencyError(errors);
  }

  // Validate all items were processed (no gaps)
  if (completedCount !== items.length) {
    throw new ConcurrencyError([
      {
        index: -1,
        error: new Error(
          `Processing incomplete: expected ${items.length} items, completed ${completedCount}`,
        ),
      },
    ]);
  }

  // Convert Map back to array, ensuring order is preserved
  const orderedResults: R[] = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    const result = results.get(i);
    if (result === undefined && !results.has(i)) {
      throw new ConcurrencyError([
        {
          index: i,
          error: new Error(`Missing result for index ${i}`),
        },
      ]);
    }
    orderedResults[i] = result as R;
  }

  return orderedResults;
}
