/** L1: the global methodology, read-only, pinned by version and document hash.
 *
 * src/data/sox_itgc_0_4_1.json is generated from the approved methodology text by scripts/build-methodology.mjs
 * (module text verbatim) plus the hand-maintained src/data/engine-mapping.json. Engagements scope a subset of modules;
 * `scoped()` gives the planner, validators, and agents only the modules in scope.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EngineError, REPO_ROOT, sha256 } from "./db.js";

export const DATA_FILE = join(REPO_ROOT, "src", "data", "sox_itgc_0_4_1.json");

export interface Expectation { code: string; text: string; tested_by: string[]; tested_elsewhere?: string[] }
export interface Attribute { code: string; text: string; type: string; group?: string }
export interface Population { part: string; population: string; selection: string }
export interface Module {
  code: string; title: string; section: string; risk: string; risk_category: string;
  control_types: string[]; pattern: string; population: string; populations?: Population[];
  expectations: Expectation[]; attributes: Attribute[]; evidence: string[];
  criteria: Record<string, { field: string; design_criterion: string }>;
}
export interface Methodology {
  version: string; source_document: string; general_criteria: Record<string, string>; modules: Module[];
  data_hash: string; document_hash: string; modulesByCode: Record<string, Module>;
  /** Every module of the methodology, also when this object is scoped to an engagement. */
  all_modules: Module[];
}

let cache: Methodology | undefined;

/** The methodology data with the pin fields filled in: `document_hash` is the sha256 of the approved methodology
 * markdown when present, so an engagement pins the exact text it was planned against; the JSON is hashed as `data_hash`. */
export function load(repoRoot: string = REPO_ROOT): Methodology {
  if (cache) return cache;
  const raw = readFileSync(DATA_FILE);
  const data = JSON.parse(raw.toString("utf8"));
  data.data_hash = sha256(raw);
  const doc = join(repoRoot, data.source_document);
  data.document_hash = existsSync(doc) ? sha256(readFileSync(doc)) : "unavailable";
  data.modulesByCode = Object.fromEntries(data.modules.map((m: Module) => [m.code, m]));
  data.all_modules = data.modules;
  cache = data;
  return data;
}

export const ALL_MODULE_CODES = (): string[] => load().modules.map((m) => m.code);

/** The methodology restricted to the engagement's modules (null or empty: every module). */
export function scoped(data: Methodology, modules: string[] | null | undefined): Methodology {
  if (!modules || !modules.length) return data;
  const unknown = modules.filter((c) => !(c in data.modulesByCode));
  if (unknown.length) throw new EngineError(`unknown module(s) in engagement scope: ${unknown.join(", ")}`);
  const keep = data.all_modules.filter((m) => modules.includes(m.code));
  return { ...data, modules: keep, modulesByCode: Object.fromEntries(keep.map((m) => [m.code, m])) };
}

export function module(data: Methodology, code: string): Module {
  return data.modulesByCode[code];
}

export function moduleForControlType(data: Methodology, controlType: string): Module | undefined {
  return data.modules.find((m) => m.control_types.includes(controlType));
}

/** Attribute code -> [client criterion field, general design criterion breached when no source defines it], for every module. */
export const ATTRIBUTE_CRITERION: Record<string, [string, string]> = Object.fromEntries(
  load().modules.flatMap((m) => Object.entries(m.criteria).map(([a, c]) => [a, [c.field, c.design_criterion] as [string, string]])));

/** Criterion fields: timeframes are compared by their normalized duration; the listed ones are material when sources disagree. */
export const isTimeframeField = (f: string) => /(_timeframe|_window)$/.test(f);
export const isMaterialField = (f: string) => isTimeframeField(f) || ["approver", "emergency_approver", "approval_timing", "frequency", "reviewer",
  "password_parameters", "mfa_scope", "backup_schedule", "restore_test_frequency", "reconciliation_frequency"].includes(f);
export const CRITERION_FIELD_NAMES = new Set(Object.values(ATTRIBUTE_CRITERION).map(([f]) => f));
