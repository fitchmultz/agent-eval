/**
 * Purpose: Load bundled CSS for HTML reports.
 * Entrypoint: Used by render.ts to inline styles in generated HTML.
 * Notes: Fails loudly when the packaged CSS asset is missing.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STYLES_PATH = join(__dirname, "..", "styles", "report.css");

/**
 * Loads CSS styles from the packaged runtime asset.
 * Throws a descriptive error when the asset is missing.
 */
export function loadStyles(): string {
  try {
    const css = readFileSync(STYLES_PATH, "utf8");
    if (css.trim().length === 0) {
      throw new Error("Bundled report CSS is empty.");
    }
    return css;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not load bundled report CSS at ${STYLES_PATH}. Rebuild the project so dist/styles/report.css is present. ${detail}`,
    );
  }
}

/**
 * Generates the CSS styles for the HTML report.
 * @returns CSS string
 */
export function renderStyles(): string {
  return loadStyles();
}
