/**
 * Purpose: Provides concurrency primitives for parallel async operations.
 * Entrypoint: `mapWithConcurrency()` for bounded parallel processing of async operations.
 * Notes: Generic utility for executing async work with controlled concurrency limits.
 */

/**
 * Maps an array of items to results using async workers with a concurrency limit.
 * Maintains order of results matching the input array order.
 * @param items - Array of items to process
 * @param concurrency - Maximum number of concurrent workers
 * @param worker - Async function to process each item
 * @returns Array of results in the same order as input items
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const item = items[currentIndex];
      if (item === undefined) {
        return;
      }

      results[currentIndex] = await worker(item, currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () =>
      runWorker(),
    ),
  );

  return results;
}
