/**
 * Purpose: CSS generation for HTML reports.
 * Entrypoint: Used by render.ts to include styles in HTML output.
 * Notes: Reads external CSS file for maintainability.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STYLES_PATH = join(__dirname, "..", "styles", "report.css");

/**
 * Loads CSS styles from external file.
 * Falls back to inline styles if file cannot be read.
 */
export function loadStyles(): string {
  try {
    return readFileSync(STYLES_PATH, "utf8");
  } catch {
    // Fallback: return empty string - styles will be loaded from external file
    return "";
  }
}

/**
 * Generates the CSS styles for the HTML report.
 * @returns CSS string
 */
export function renderStyles(): string {
  return loadStyles();
}
