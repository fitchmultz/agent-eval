/**
 * Purpose: Generates the static favicon asset shipped with HTML transcript reports.
 * Entrypoint: `renderFaviconSvg()` is consumed by the presentation layer and artifact writer.
 * Notes: The favicon is intentionally lightweight and dependency-free so every report bundle stays portable.
 */

import { Buffer } from "node:buffer";

const FAVICON_ICO_BASE64 =
  "AAABAAEAEBAAAAAAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAGAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABk6VQAZOlX/MG+X/2V8iv9kcnn/ZHF4/2V8iv8wb5f/GDpV/wAAAAAAAAAAAAAAAAAAAAAAAAAZOlX/XJ28/4hxfv+TWFf/k1dW/5NXVv+TV1b/k1dW/5JYV/+Icn//W569/xk6Vf8AAAAAAAAAAAAAABk6Vf+Di6z/o1lY/9pcWf/4+Pj/////////////8/Pz/9pcWf/p5+f/o1lY/4SLrP8ZOlX/AAAAAAAAAAAAGTpV/4d1g/+4Wlv/8fHx///////r6+v/urq6/7q6uv/r6+v//////+/v7/+4Wlv/h3WE/xk6Vf8AAAAAAAAAABk6Vf+Ed4j/v1lb/+rq6v/Y2Nj/7+/v////////////7+/v19fX/+rq6v+/W1v/hHeI/xk6Vf8AAAAAAAAAABk6Vf+DdIj/wFtc/+vr6//X19f/7+/v////////////7+/v1tbW/+rq6v+/W1z/g3SI/xk6Vf8AAAAAAAAAABk6Vf+Di6z/s1hX//T09P///////////////////////////////+/v7/Pz8/+zWFf/g4us/xk6Vf8AAAAAAAAAAAAAABk6Vf9ccLr/iXJ//9ZXVv+7u7v/7u7u///////v7+//u7u7/9ZXVv+Jcn//XHC6/xk6Vf8AAAAAAAAAAAAAAAAAAAAAGTpV/zBvl/9lfIr/ZHJ5/2RxeP9lfIr/MG+X/xk6Vf8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

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

export function renderFaviconIco(): Uint8Array {
  return Buffer.from(FAVICON_ICO_BASE64, "base64");
}
