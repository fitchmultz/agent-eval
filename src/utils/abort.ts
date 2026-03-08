/**
 * Purpose: Provides AbortSignal utilities for timeout handling and signal combining.
 * Entrypoint: `combineSignals()`, `createTimeoutSignal()`, `createTimeoutPromise()`
 * Notes: Centralized abort/timeout primitives for consistent cancellation support.
 */

/**
 * Combines multiple AbortSignals into a single signal that aborts when any input aborts.
 * Returns the input signal if only one is provided, creates a combined signal for multiple.
 *
 * @param signals - Array of AbortSignals to combine
 * @returns A single AbortSignal that aborts when any input aborts
 *
 * @example
 * ```typescript
 * const combined = combineSignals([userSignal, timeoutSignal]);
 * await fetch(url, { signal: combined });
 * ```
 */
export function combineSignals(
  signals: readonly (AbortSignal | undefined)[],
): AbortSignal {
  // Filter out undefined/null signals
  const validSignals = signals.filter(
    (s): s is AbortSignal => s !== undefined && s !== null,
  );

  if (validSignals.length === 0) {
    // Return a never-aborting signal
    return new AbortController().signal;
  }

  if (validSignals.length === 1) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return validSignals[0]!;
  }

  const controller = new AbortController();

  for (const signal of validSignals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
  }

  const abortHandlers = new Map<AbortSignal, () => void>();

  for (const signal of validSignals) {
    const handler = (): void => {
      // Clean up other listeners
      for (const [s, h] of abortHandlers) {
        s.removeEventListener("abort", h);
      }
      controller.abort(signal.reason);
    };
    abortHandlers.set(signal, handler);
    signal.addEventListener("abort", handler, { once: true });
  }

  return controller.signal;
}

/**
 * Creates an AbortSignal that automatically aborts after the specified timeout.
 * Returns undefined for non-positive timeouts.
 *
 * @param timeoutMs - Timeout in milliseconds
 * @returns An AbortController with signal that aborts after timeout, or undefined
 *
 * @example
 * ```typescript
 * const { signal, clear } = createTimeoutSignal(5000);
 * try {
 *   await operation({ signal });
 * } finally {
 *   clear(); // Clean up timeout
 * }
 * ```
 */
export function createTimeoutSignal(
  timeoutMs: number,
): { signal: AbortSignal; clear: () => void } | undefined {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return undefined;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException("Timeout exceeded", "TimeoutError"));
  }, timeoutMs);

  const clear = (): void => {
    clearTimeout(timeoutId);
  };

  return { signal: controller.signal, clear };
}

/**
 * Creates a promise that rejects after the specified timeout with a DOMException.
 *
 * @param timeoutMs - Timeout in milliseconds
 * @param message - Optional message for the timeout error
 * @returns A promise that rejects after the timeout
 *
 * @example
 * ```typescript
 * const result = await Promise.race([
 *   operation(),
 *   createTimeoutPromise(5000, "Operation timed out")
 * ]);
 * ```
 */
export function createTimeoutPromise(
  timeoutMs: number,
  message?: string,
): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new DOMException(message ?? "Timeout exceeded", "TimeoutError"));
    }, timeoutMs);
  });
}

/**
 * Throws an AbortError if the signal is aborted.
 * Use this in async operations to check for cancellation.
 *
 * @param signal - AbortSignal to check
 * @throws DOMException with name "AbortError" if signal is aborted
 *
 * @example
 * ```typescript
 * async function operation(signal?: AbortSignal) {
 *   throwIfAborted(signal);
 *   // Continue with operation...
 * }
 * ```
 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

/**
 * Wraps an async iterable with abort checking.
 * Yields values from the source iterable while checking for abort signal.
 *
 * @param source - Source async iterable
 * @param signal - AbortSignal to check
 * @returns Async iterable that checks for abort between yields
 *
 * @example
 * ```typescript
 * for await (const item of withAbortCheck(sourceIterable, signal)) {
 *   // Process item - abort checked before each iteration
 * }
 * ```
 */
export async function* withAbortCheck<T>(
  source: AsyncIterable<T>,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  for await (const item of source) {
    throwIfAborted(signal);
    yield item;
  }
}
