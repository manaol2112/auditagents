#!/usr/bin/env node
/** WCAG 2.2 AA contrast gate for the design tokens in src/styles.css, in both themes. Text pairs need 4.5:1; large text
 * and non-text indicators are not checked here. Exit code 1 on any failure. No dependencies. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const css = readFileSync(join(fileURLToPath(new URL(".", import.meta.url)), "..", "src", "styles.css"), "utf8");
const block = (re) => { const m = re.exec(css); if (!m) throw new Error("token block not found: " + re); return m[1]; };
const tokens = (src) => Object.fromEntries([...src.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
const light = tokens(block(/:root\s*\{([\s\S]*?)\n\}/));
const dark = { ...light, ...tokens(block(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([\s\S]*?)\n  \}/)) };

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [foreground, background] pairs the UI actually renders as text.
const PAIRS = [
  ...["bg", "bg-subtle", "bg-muted", "sidebar", "surface"].flatMap((bg) => [["text", bg], ["text-muted", bg], ["text-subtle", bg], ["accent-text", bg]]),
  ["danger", "bg"], ["danger", "surface"], ["warning", "bg"], ["success", "bg"],
  ["on-accent", "accent"], ["on-accent", "accent-hover"], ["accent-text", "accent-soft"], ["text", "accent-soft"], ["text-muted", "accent-soft"],
  ["success", "success-soft"], ["warning", "warning-soft"], ["danger", "danger-soft"], ["info", "info-soft"],
  ["text-muted", "warning-soft"], ["text-muted", "success-soft"],
];

let failed = 0;
for (const [theme, t] of [["light", light], ["dark", dark]]) {
  for (const [fg, bg] of PAIRS) {
    if (!t[fg] || !t[bg]) { console.error(`contrast-check: missing token --${!t[fg] ? fg : bg} (${theme})`); failed++; continue; }
    const r = ratio(t[fg], t[bg]);
    if (r < 4.5) { console.error(`contrast-check: ${theme} --${fg} on --${bg} is ${r.toFixed(2)}:1 (needs 4.5:1)`); failed++; }
  }
}
if (failed) process.exit(1);
console.log(`contrast-check: ok (${PAIRS.length} text pairs × 2 themes, all ≥ 4.5:1)`);
