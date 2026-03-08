/**
 * Purpose: Shared type guard utilities for transcript parsing.
 * Entrypoint: Used by all transcript parsing modules for safe type narrowing.
 * Notes: Re-exports from centralized utils/type-guards.ts.
 */

export {
  asRecord,
  asString,
  getValue,
  isRecord,
} from "../utils/type-guards.js";
