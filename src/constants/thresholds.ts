/**
 * Purpose: Centralizes all magic numbers, thresholds, weights, and hardcoded configuration
 * values with documentation explaining rationale.
 */

/** Concurrency settings for different evaluation modes */
export const CONCURRENCY = {
  /** Optimal for I/O-bound transcript parsing */
  FULL_EVALUATION: 4,
  /** Higher for CPU-bound summary generation */
  SUMMARY_EVALUATION: 8,
} as const;

/** Clustering algorithm settings */
export const CLUSTERING = {
  /** Turns within 2 positions cluster as incident */
  MAX_TURN_GAP: 2,
} as const;

/** Preview and truncation settings for message handling */
export const PREVIEWS = {
  /** Fits typical terminal width minus metadata */
  MAX_MESSAGE_LENGTH: 220,
  /** Balance detail vs noise */
  MAX_MESSAGE_ITEMS: 2,
  /** Maximum number of evidence previews per incident */
  MAX_INCIDENT_EVIDENCE: 3,
  /** Maximum number of top incidents to include in summaries */
  MAX_TOP_INCIDENTS: 8,
  /** Maximum number of victory lap sessions to highlight */
  MAX_VICTORY_LAPS: 6,
  /** Maximum number of top sessions to include in summaries */
  MAX_TOP_SESSIONS: 8,
} as const;

/** Incident-only label weights for session friction calculation */
export const INCIDENT_FRICTION_WEIGHTS: {
  context_drift: number;
  test_build_lint_failure_complaint: number;
  regression_report: number;
  stalled_or_guessing: number;
} = {
  context_drift: 4,
  test_build_lint_failure_complaint: 5,
  regression_report: 5,
  stalled_or_guessing: 5,
} as const;

/** Scoring constants for friction calculation and compliance */
export const SCORING = {
  /** Empirically derived from session analysis */
  FRICTION_THRESHOLD: 6,
  /** High friction threshold for UI highlighting */
  HIGH_FRICTION_THRESHOLD: 8,
  /** Compliance penalty divisor */
  COMPLIANCE_PENALTY_DIVISOR: 10,
} as const;

/** Compliance scoring constants */
export const COMPLIANCE = {
  /** Starting compliance score */
  STARTING_SCORE: 100,
  /** Per-rule failure penalty */
  FAILURE_PENALTY: 20,
} as const;

/** Flow penalty multipliers for different disruption types (used in score calculation) */
export const FLOW_PENALTY_MULTIPLIERS = {
  /** Medium disruption */
  INTERRUPT: 8,
  /** High disruption */
  CONTEXT_REINJECTION: 20,
  /** Very high disruption */
  CONTEXT_DRIFT: 40,
} as const;

/** Signal scoring weights for message preview ranking */
export const SIGNAL_SCORING = {
  /** Penalty for low-signal patterns (boilerplate) */
  LOW_SIGNAL_PENALTY: -20,
  /** Bonus for normal signal content */
  NORMAL_SIGNAL_BONUS: 10,
  /** Bonus for first-person language (I, we, my, etc.) */
  FIRST_PERSON_BONUS: 4,
  /** Bonus for feedback keywords (stuck, broken, fail, etc.) */
  FEEDBACK_KEYWORD_BONUS: 4,
  /** Bonus for punctuation indicating human speech (? or !) */
  PUNCTUATION_BONUS: 1,
  /** Minimum word count threshold for first bonus tier */
  MIN_WORD_THRESHOLD_1: 6,
  /** Minimum word count threshold for second bonus tier */
  MIN_WORD_THRESHOLD_2: 14,
  /** Word count bonus for meeting first threshold */
  WORD_COUNT_BONUS_1: 2,
  /** Word count bonus for meeting second threshold */
  WORD_COUNT_BONUS_2: 1,
  /** Penalty for markup content (HTML-like tags) */
  MARKUP_PENALTY: -4,
  /** Penalty for boilerplate content (only symbols/caps) */
  BOILERPLATE_PENALTY: -2,
} as const;

/** Badge threshold constants for achievement badges */
export const BADGES = {
  /** Minimum sessions for "Battle-Tested Corpus" badge */
  MIN_SESSIONS_FOR_BATTLE_TESTED: 1000,
  /** Minimum verification rate for "Proof-Backed Builder" badge (percentage) */
  MIN_VERIFICATION_RATE: 90,
  /** Maximum interruption rate for "Low-Drama Operator" badge (percentage) */
  MAX_INTERRUPTION_RATE: 2,
} as const;

/** Opportunity threshold constants for improvement suggestions */
export const OPPORTUNITIES = {
  /** Minimum verification demand rate to suggest reducing prompting burden */
  MIN_VERIFICATION_DEMAND: 15,
  /** Minimum reinjection demand rate to suggest improving context retention */
  MIN_REINJECTION_DEMAND: 8,
  /** Maximum number of suggestions to include */
  MAX_SUGGESTIONS: 5,
} as const;

/** Momentum tone threshold constants for delta-based tone classification */
export const MOMENTUM_TONE = {
  /** Good momentum threshold (positive delta) */
  GOOD_THRESHOLD: 5,
  /** Warning threshold for negative momentum */
  WARN_THRESHOLD: -5,
  /** Danger threshold for significant negative momentum */
  DANGER_THRESHOLD: -10,
} as const;

/** Score tone threshold constants for score-based tone classification */
export const SCORE_TONE = {
  /** Good score threshold (90-100) */
  GOOD: 90,
  /** Neutral score threshold (70-89) */
  NEUTRAL: 70,
  /** Warning score threshold (40-69) */
  WARN: 40,
} as const;

/** Comparative slice window sizes for trend analysis */
export const COMPARATIVE_SLICES = {
  /** Recent windows representing approximate day/week/month equivalents */
  CANDIDATE_SIZES: [100, 500, 1000] as const,
} as const;

/** Chart dimension constants for SVG rendering */
export const CHARTS = {
  /** Total chart width in pixels */
  WIDTH: 920,
  /** Height of each bar row in pixels */
  ROW_HEIGHT: 34,
  /** Top padding for title in pixels */
  TOP_PADDING: 56,
  /** Left padding for labels in pixels */
  LEFT_PADDING: 220,
  /** Right padding for values in pixels */
  RIGHT_PADDING: 72,
} as const;

/** Interruption load threshold for warning tone in headlines */
export const INTERRUPTION_LOAD = {
  /** Threshold for warning tone (interrupts per 100 turns) */
  WARN_THRESHOLD: 10,
} as const;

/** Dominant labels limit for session display */
export const DOMINANT_LABELS = {
  /** Maximum number of dominant labels to show per session */
  MAX_COUNT: 3,
} as const;

/** Context confirmation minimum message length (characters) */
export const CONTEXT_CONFIRMATION = {
  /** Minimum message length to count as context confirmation */
  MIN_MESSAGE_LENGTH: 20,
} as const;

/** Sanitization constants */
export const SANITIZATION = {
  /** Truncation ellipsis length */
  ELLIPSIS_LENGTH: 3,
} as const;
