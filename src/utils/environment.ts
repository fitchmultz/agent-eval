/**
 * Purpose: Environment-related utilities.
 * Entrypoint: `getHomeDirectory()` for HOME environment access.
 */

export function getHomeDirectory(): string | undefined {
  // biome-ignore lint/complexity/useLiteralKeys: Required for TypeScript index signature access
  return process.env["HOME"];
}
