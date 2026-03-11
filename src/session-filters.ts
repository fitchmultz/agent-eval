/**
 * Purpose: Provides session filtering utilities for extracting subsets of sessions based on metrics.
 * Entrypoint: Use `filterWriteSessions()`, `filterEndedVerifiedWriteSessions()`, and `filterQuietSessions()` for consistent filtering.
 * Notes: Centralizes filtering logic to eliminate duplication across summary generation and decoration modules.
 */

import type { SessionMetrics } from "./schema.js";

/**
 * Filters sessions to include only those with write operations.
 * @param sessions - Array of session metrics to filter
 * @returns Sessions that have at least one write operation
 */
export function filterWriteSessions(
  sessions: readonly SessionMetrics[],
): SessionMetrics[] {
  return sessions.filter((session) => session.writeCount > 0);
}

/**
 * Filters sessions to include only write sessions that ended verified.
 * These are sessions whose final write was followed by a passing post-write verification.
 * @param sessions - Array of session metrics to filter
 * @returns Sessions with writes whose terminal state is verified
 */
export function filterEndedVerifiedWriteSessions(
  sessions: readonly SessionMetrics[],
): SessionMetrics[] {
  return filterWriteSessions(sessions).filter(
    (session) => session.endedVerified,
  );
}

/**
 * Filters sessions to include only "quiet" sessions without incidents.
 * @param sessions - Array of session metrics to filter
 * @returns Sessions with zero incidents
 */
export function filterQuietSessions(
  sessions: readonly SessionMetrics[],
): SessionMetrics[] {
  return sessions.filter((session) => session.incidentCount === 0);
}
