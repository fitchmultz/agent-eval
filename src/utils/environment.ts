/**
 * Purpose: Environment-related utilities with validation and cross-platform support.
 * Entrypoint: `getHomeDirectory()`, `getValidatedHomeDirectory()` for HOME environment access.
 * Notes: Supports Unix (HOME) and Windows (USERPROFILE) environment variables.
 */

import { ValidationError } from "../errors.js";

/**
 * Gets the raw home directory from environment variables.
 * Checks HOME (Unix) and USERPROFILE (Windows) environment variables.
 * @returns The home directory path, or undefined if not found
 */
export function getHomeDirectory(): string | undefined {
  // biome-ignore lint/complexity/useLiteralKeys: Required for TypeScript index signature access
  return process.env["HOME"] ?? process.env["USERPROFILE"];
}

/**
 * Gets the home directory with validation.
 * Throws ValidationError if HOME/USERPROFILE is not set or empty.
 *
 * @returns The validated home directory path
 * @throws ValidationError if HOME (Unix) or USERPROFILE (Windows) is not set
 */
export function getValidatedHomeDirectory(): string {
  // biome-ignore lint/complexity/useLiteralKeys: Required for TypeScript index signature access
  const homeDirectory = process.env["HOME"];
  // biome-ignore lint/complexity/useLiteralKeys: Required for TypeScript index signature access
  const userProfile = process.env["USERPROFILE"];

  const home = homeDirectory ?? userProfile;

  if (!home || typeof home !== "string" || home.trim().length === 0) {
    throw new ValidationError(
      "HOME environment variable (Unix) or USERPROFILE (Windows) is not set. " +
        "Please set your home directory environment variable and try again.",
    );
  }

  return home;
}

/**
 * Checks if the environment has a valid home directory configured.
 * @returns True if HOME or USERPROFILE is set to a non-empty value
 */
export function hasHomeDirectory(): boolean {
  try {
    const home = getValidatedHomeDirectory();
    return home.length > 0;
  } catch {
    return false;
  }
}
