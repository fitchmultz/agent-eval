/**
 * Purpose: Generates the static favicon asset shipped with HTML transcript reports.
 * Entrypoint: `renderFaviconSvg()` is consumed by the presentation layer and artifact writer.
 * Notes: The favicon is intentionally lightweight and dependency-free so every report bundle stays portable.
 */

export function renderFaviconSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
    "  <defs>",
    '    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">',
    '      <stop offset="0%" stop-color="#1d3557" />',
    '      <stop offset="100%" stop-color="#457b9d" />',
    "    </linearGradient>",
    "  </defs>",
    '  <rect width="64" height="64" rx="14" fill="url(#bg)" />',
    '  <path d="M16 20h32v6H16zm0 12h22v6H16zm0 12h14v6H16z" fill="#f1faee" />',
    '  <circle cx="47" cy="44" r="9" fill="#e63946" />',
    '  <path d="M43 44.5l2.4 2.4 5.2-5.7" fill="none" stroke="#f1faee" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.8" />',
    "</svg>",
    "",
  ].join("\n");
}
