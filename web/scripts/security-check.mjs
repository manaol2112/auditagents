#!/usr/bin/env node
/** Security gate for the web UI. Runs in `npm run check` (source) and after every `npm run build` (--dist).
 *
 * Source rules (web/src): bans the patterns that turn into XSS, data leaks or uncontrolled network access.
 * A line may be exempted only with an inline `security-reviewed: <reason>` comment, which keeps every exception
 * visible in review. Build rules (web/dist): no source maps, no inline scripts or styles, no external origins in the
 * HTML, nothing but the expected file types.
 *
 * Exit code 1 on any violation. No dependencies.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SRC = process.env.SECURITY_CHECK_SRC ?? join(ROOT, "src");   // overridable for the scanner's own tests
const DIST = join(ROOT, "dist");
const NETWORK_MODULE = join(SRC, "api", "client.ts");

const SOURCE_RULES = [
  { id: "no-dangerous-html", re: /dangerouslySetInnerHTML/, why: "renders raw HTML (XSS); render text children instead" },
  { id: "no-html-sinks", re: /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write(ln)?\s*\(|createContextualFragment|DOMParser/, why: "DOM XSS sink" },
  { id: "no-eval", re: /\beval\s*\(|new\s+Function\s*\(|set(Timeout|Interval)\s*\(\s*["'`]/, why: "dynamic code execution (also blocked by the CSP)" },
  { id: "no-browser-storage", re: /\b(localStorage|sessionStorage|indexedDB|document\.cookie|caches\.open)\b/, why: "audit data must not persist in the browser" },
  { id: "no-raw-network", re: /\b(XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b|navigator\.serviceWorker/, why: "network access goes through api/client.ts only" },
  { id: "fetch-only-in-client", re: /\bfetch\s*\(/, why: "network access goes through api/client.ts only", skip: (f) => f === NETWORK_MODULE },
  { id: "no-js-urls", re: /javascript:/i, why: "script URLs", raw: true },
  { id: "no-external-origins", re: /https?:\/\/(?!127\.0\.0\.1|localhost)[^\s"'`)]+/, why: "no third-party origins (data leak, supply chain)", raw: true },
  { id: "no-window-open", re: /window\.open\s*\(|target=["']_blank/, why: "new browsing contexts can leak the opener" },
  { id: "no-postmessage", re: /postMessage\s*\(/, why: "cross-window messaging" },
  { id: "no-console", re: /\bconsole\.(log|debug|info|trace|table|dir|warn|error)\s*\(/, why: "console output can leak record data" },
  { id: "no-inline-style", re: /\bstyle=\{/, why: "styles come from the design tokens in styles.css (and inline style attributes are a CSP exception)" },
  { id: "no-unsafe-any-cast", re: /as\s+any\b/, why: "bypasses the validated API types" },
];

const EXEMPT = /security-reviewed:\s*\S+/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const violations = [];
const flag = (file, line, rule, why) => violations.push(`${relative(ROOT, file)}${line ? `:${line}` : ""}  [${rule}] ${why}`);

function checkSource() {
  for (const file of walk(SRC).filter((f) => /\.(ts|tsx|js|jsx|mjs|css|html)$/.test(f))) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, i) => {
      if (EXEMPT.test(text)) return;
      // Most rules apply to code, not comments; `raw` rules (URLs) apply to every character of the file.
      const isComment = /^\s*(\*|\/\*)/.test(text);
      const code = isComment ? "" : text.replace(/(^|\s)\/\/.*$/, "$1").replace(/\/\*.*?\*\//g, "");
      for (const r of SOURCE_RULES) {
        if (r.skip && r.skip(file)) continue;
        if (r.re.test(r.raw ? text : code)) flag(file, i + 1, r.id, r.why);
      }
    });
  }
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) flag(join(ROOT, "index.html"), 0, "no-inline-script", "inline scripts are blocked by the CSP");
  if (/\sstyle\s*=|<style/i.test(html)) flag(join(ROOT, "index.html"), 0, "no-inline-style", "inline styles are blocked by the CSP");
}

const DIST_TYPES = new Set([".html", ".js", ".css", ".svg", ".png", ".ico", ".woff2", ".txt"]);

function checkDist() {
  let files;
  try { files = walk(DIST); } catch { flag(DIST, 0, "dist-missing", "run vite build first"); return; }
  for (const file of files) {
    const ext = extname(file);
    if (ext === ".map") flag(file, 0, "no-source-maps", "source maps disclose source code");
    else if (!DIST_TYPES.has(ext)) flag(file, 0, "unexpected-file", `unexpected ${ext || "extensionless"} file in the build`);
    if (ext === ".js" && /sourceMappingURL=/.test(readFileSync(file, "utf8"))) flag(file, 0, "no-source-maps", "sourceMappingURL reference");
  }
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc="\/assets\/[\w.-]+\.js"/.test(m[1] ?? "") || (m[2] ?? "").trim()) flag(join(DIST, "index.html"), 0, "no-inline-script", "every script must be a same-origin /assets file");
  }
  if (/\sstyle\s*=|<style/i.test(html)) flag(join(DIST, "index.html"), 0, "no-inline-style", "inline style in built HTML");
  if (/(src|href)="(https?:)?\/\//i.test(html)) flag(join(DIST, "index.html"), 0, "no-external-origins", "built HTML references another origin");
}

checkSource();
if (process.argv.includes("--dist")) checkDist();

if (violations.length) {
  console.error(`security-check: ${violations.length} violation(s)\n  ` + violations.join("\n  "));
  process.exit(1);
}
console.log(`security-check: ok (${process.argv.includes("--dist") ? "source + build" : "source"})`);
