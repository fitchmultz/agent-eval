/**
 * Purpose: Provides session filtering utilities for extracting subsets of sessions based on metrics.
 * Entrypoint: Use `filterWriteSessions()`, `filterVerifiedWriteSessions()`, and `filterQuietSessions()` for consistent filtering.
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
 * Filters sessions to include only verified write sessions.
 * These are sessions that performed writes AND had at least one passing verification.
 * @param sessions - Array of session metrics to filter
 * @returns Sessions with writes that have passing verifications
 */
export function filterVerifiedWriteSessions(
  sessions: readonly SessionMetrics[],
): SessionMetrics[] {
  return filterWriteSessions(sessions).filter(
    (session) => session.verificationPassedCount > 0,
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
