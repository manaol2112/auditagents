// Regenerate src/data/sox_itgc_0_4_1.json from the approved methodology text (section 4 general criteria,
// section 6 modules) plus src/data/engine-mapping.json. The module text is verbatim; nothing is paraphrased.
//   node scripts/build-methodology.mjs           write the file
//   node scripts/build-methodology.mjs --check   exit 1 if the committed file is out of date
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const SOURCE = "methodology/sox-itgc-methodology.md";
const OUT = new URL("src/data/sox_itgc_0_4_1.json", root);
const md = readFileSync(new URL(SOURCE, root), "utf8").split("\n");
const mapping = JSON.parse(readFileSync(new URL("src/data/engine-mapping.json", root), "utf8")).modules;
const version = /version\s+(\d+\.\d+\.\d+)/i.exec(md.slice(0, 15).join(" "))?.[1];
if (!version) throw new Error("methodology version not found in the document header");

const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isRule = (c) => c.every((x) => /^[-: ]*$/.test(x));
const clean = (s) => s.replace(/\s*\*\*\[[A-Z]\]\*\*\s*$/, "").replace(/\s*\[[A-Z]\]\s*$/, "").trim();

// General design criteria D1..D7: the first table whose rows start with D1.
const general = {};
for (const l of md) {
  if (!l.startsWith("|")) continue;
  const [id, text] = cells(l);
  if (/^D[1-9]$/.test(id) && !(id in general)) general[id] = clean(text);
}

const start = md.findIndex((l) => l.startsWith("## 6. "));
const end = md.findIndex((l, i) => i > start && /^## \d+\. /.test(l));
const raw = [];
let m = null, block = null;
for (let i = start; i < end; i++) {
  const l = md[i];
  const h = /^### (6\.\d+) (.+) \(module ([A-Z0-9-]+)\)/.exec(l);
  if (h) { m = { code: h[3], title: h[2], section: h[1], blocks: {} }; raw.push(m); block = null; continue; }
  if (!m) continue;
  const b = /^\*\*([^*]+?)\.?\*\*\s*(.*)$/.exec(l);
  if (b) { block = b[1].replace(/\.$/, ""); m.blocks[block] ??= { text: [], rows: [], bullets: [] }; if (b[2]) m.blocks[block].text.push(b[2]); continue; }
  if (!block) continue;
  const bl = m.blocks[block];
  if (l.startsWith("|")) { const c = cells(l); if (!isRule(c) && !["ID", "Part of the control"].includes(c[0])) bl.rows.push(c); }
  else if (/^- /.test(l)) bl.bullets.push(l.slice(2).trim());
  else if (l.trim() && !l.startsWith("---")) bl.text.push(l.trim());
}


/** "UAR-A", "CHG-D, CHG-F", "PRIV-G to PRIV-I", "PHYS-B to PHYS-D, TP-SOC1", "Module AC-PRIV", "Walkthrough", "Planning record; M-28".
 * Attribute codes of this module (ranges expanded) go in tested_by; everything else (another module, a rule, a walkthrough,
 * the population definition) is kept verbatim in tested_elsewhere so the expectation is never silently untested. */
function testedBy(text, codes, moduleCode) {
  const tested_by = [], elsewhere = [];
  for (const part of text.split(/,\s*|;\s*|\s+and\s+/).map((x) => x.trim()).filter(Boolean)) {
    const range = /^([A-Z]+)-([A-Z])\s+to\s+\1-([A-Z])$/.exec(part);
    if (range) {
      for (let c = range[2].charCodeAt(0); c <= range[3].charCodeAt(0); c++) tested_by.push(`${range[1]}-${String.fromCharCode(c)}`);
    } else if (codes.has(part)) tested_by.push(part);
    else elsewhere.push(part);
  }
  for (const t of tested_by) if (!codes.has(t)) throw new Error(`${moduleCode}: range expands to unknown attribute ${t}`);
  return { tested_by, ...(elsewhere.length ? { tested_elsewhere: elsewhere } : {}) };
}

const errors = [];
const modules = raw.map((r) => {
  const B = r.blocks, map = mapping[r.code];
  if (!map) errors.push(`${r.code}: no entry in engine-mapping.json`);
  const attributes = Object.keys(B).filter((k) => /^Operating attribute/.test(k)).flatMap((k) => {
    const group = k.replace(/^Operating attributes?:?,?\s*/, "").trim();
    return B[k].rows.map(([code, text, type]) => ({ code, text: clean(text), type: (type ?? "").trim(), ...(group ? { group } : {}) }));
  });
  const codes = new Set(attributes.map((a) => a.code));
  const expectations = (B["Design expectations"]?.rows ?? []).map(([code, text, by]) => ({ code, text: clean(text), ...testedBy(by ?? "", codes, r.code) }));
  const popBlock = B["Population"] ?? B["Populations"];
  const populations = (popBlock?.rows ?? []).map(([part, population, selection]) => ({ part, population: clean(population), selection: clean(selection ?? "") }));
  const population = populations.length ? populations.map((p) => `${p.part}: ${p.population}.`).join(" ") : clean([...(popBlock?.text ?? []), ...(popBlock?.bullets ?? [])].join(" "));
  for (const e of expectations) for (const t of e.tested_by) if (!codes.has(t)) errors.push(`${r.code}/${e.code}: tested_by ${t} is not an attribute of the module`);
  for (const a of Object.keys(map?.criteria ?? {})) if (!codes.has(a)) errors.push(`${r.code}: mapping names unknown attribute ${a}`);
  if (!expectations.length || !attributes.length) errors.push(`${r.code}: no expectations or attributes parsed`);
  return {
    code: r.code, title: r.title, section: r.section, risk: clean((B["Risk"]?.text ?? []).join(" ")),
    risk_category: map?.risk_category, control_types: map?.control_types ?? [], pattern: map?.pattern,
    population, ...(populations.length ? { populations } : {}),
    expectations, attributes, evidence: (B["Evidence to request"]?.bullets ?? []).map(clean),
    criteria: Object.fromEntries(Object.entries(map?.criteria ?? {}).map(([a, [field, d]]) => [a, { field, design_criterion: d }])),
  };
});
for (const code of Object.keys(mapping)) if (!modules.some((x) => x.code === code)) errors.push(`engine-mapping.json names ${code}, which the methodology does not define`);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }

const out = JSON.stringify({ version, source_document: SOURCE, generated_by: "scripts/build-methodology.mjs", general_criteria: general, modules }, null, 1) + "\n";
if (process.argv.includes("--check")) {
  const cur = readFileSync(OUT, "utf8");
  if (cur !== out) { console.error("src/data/sox_itgc_0_4_1.json is out of date; run: node scripts/build-methodology.mjs"); process.exit(1); }
  console.log("methodology data is up to date");
} else {
  writeFileSync(OUT, out);
  console.log(`wrote ${modules.length} modules (${modules.reduce((n, x) => n + x.expectations.length, 0)} expectations, ${modules.reduce((n, x) => n + x.attributes.length, 0)} attributes) from ${SOURCE} v${version}`);
}
