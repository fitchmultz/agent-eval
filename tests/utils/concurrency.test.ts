/**
 * Purpose: Unit tests for concurrency utilities.
 * Entrypoint: Run with `pnpm test tests/utils/concurrency.test.ts`
 * Notes: Tests bounded concurrency primitives for async operations.
 */

import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../../src/utils/concurrency.js";

describe("mapWithConcurrency", () => {
  it("should process all items and maintain order", async () => {
    const items = [1, 2, 3, 4, 5];
    const result = await mapWithConcurrency(items, 2, async (item) => item * 2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  it("should handle empty array", async () => {
    const result = await mapWithConcurrency([], 2, async (item) => item);
    expect(result).toEqual([]);
  });

  it("should handle single item", async () => {
    const result = await mapWithConcurrency([42], 2, async (item) => item * 2);
    expect(result).toEqual([84]);
  });

  it("should handle concurrency of 1 (sequential)", async () => {
    const executionOrder: number[] = [];
    const items = [1, 2, 3];

    await mapWithConcurrency(items, 1, async (item) => {
      executionOrder.push(item);
      return item;
    });

    expect(executionOrder).toEqual([1, 2, 3]);
  });

  it("should handle concurrency higher than item count", async () => {
    const items = [1, 2];
    const result = await mapWithConcurrency(
      items,
      10,
      async (item) => item * 2,
    );
    expect(result).toEqual([2, 4]);
  });

  it("should pass correct index to worker", async () => {
    const indices: number[] = [];
    await mapWithConcurrency(["a", "b", "c"], 2, async (item, index) => {
      indices.push(index);
      return item;
    });
    expect(indices).toContain(0);
    expect(indices).toContain(1);
    expect(indices).toContain(2);
  });

  it("should propagate errors from worker", async () => {
    const items = [1, 2, 3];
    const errorMessage = "Test error";

    await expect(
      mapWithConcurrency(items, 2, async (item) => {
        if (item === 2) {
          throw new Error(errorMessage);
        }
        return item;
      }),
    ).rejects.toThrow(errorMessage);
  });

  it("should handle async delays correctly", async () => {
    const startTime = Date.now();
    const items = [1, 2, 3, 4];

    await mapWithConcurrency(
      items,
      2, // concurrency of 2
      async (item) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return item;
      },
    );

    const duration = Date.now() - startTime;
    // With 4 items and concurrency of 2, should take ~100ms (2 batches of 50ms)
    // Add some tolerance for test flakiness
    expect(duration).toBeLessThan(200);
    expect(duration).toBeGreaterThanOrEqual(90);
  });

  it("should handle read-only arrays", async () => {
    const items: readonly number[] = [1, 2, 3];
    const result = await mapWithConcurrency(items, 2, async (item) => item * 2);
    expect(result).toEqual([2, 4, 6]);
  });
});
