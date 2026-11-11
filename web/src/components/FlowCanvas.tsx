/** The planning flow as recorded: intake → Planning Agent → Independent Reviewer → human, with one targeted-revision
 * node per revision cycle beneath. Rendered as React SVG elements (no string-built markup). */
import type { KeyboardEvent } from "react";
import type { WorkspaceModel, WorkspaceNode } from "../api/schema.ts";
import { tone } from "../lib/format.ts";

const W = 220, H = 92, GAP = 70, TOP = 70, ROW2 = 250, ROW_STEP = 124;
const MAIN = ["intake", "planner", "reviewer", "human"];

function layout(nodes: WorkspaceNode[]): Map<string, [number, number]> {
  const pos = new Map<string, [number, number]>();
  MAIN.forEach((id, i) => pos.set(id, [20 + i * (W + GAP), TOP]));
  const planner = pos.get("planner")!, reviewer = pos.get("reviewer")!;
  nodes.filter((n) => n.type === "revision").forEach((n, i) => pos.set(n.id, [(planner[0] + reviewer[0]) / 2, ROW2 + i * ROW_STEP]));
  nodes.filter((n) => !pos.has(n.id)).forEach((n, i) => pos.set(n.id, [20 + i * (W + GAP), ROW2 + 300]));   // unknown node kinds still render
  return pos;
}

function wrap(s: string, n: number): [string, string] {
  const words = s.split(" ");
  const lines: [string, string] = ["", ""];
  let i = 0;
  for (const w of words) {
    const next = (lines[i] + " " + w).trim();
    if (next.length > n && i === 0 && lines[0]) { i = 1; lines[1] = w; } else lines[i] = next;
  }
  if (lines[1].length > n) lines[1] = lines[1].slice(0, n - 1) + "…";
  return lines;
}

interface EdgeGeom { d: string; lx: number; ly: number }

function edgePath(a: [number, number], b: [number, number], hasReverse: boolean): EdgeGeom {
  const sameRow = a[1] === b[1];
  if (sameRow && b[0] - a[0] > W + GAP + 10) {          // skips a node: arc over the top
    const sx = a[0] + W / 2, tx = b[0] + W / 2, y = a[1];
    return { d: `M${sx},${y} C${sx},${y - 62} ${tx},${y - 62} ${tx},${y}`, lx: (sx + tx) / 2, ly: y - 52 };
  }
  if (sameRow && b[0] > a[0]) {
    const y = a[1] + H / 2 + (hasReverse ? -8 : 0);
    return { d: `M${a[0] + W},${y} L${b[0]},${y}`, lx: (a[0] + W + b[0]) / 2, ly: a[1] + H + 18 };
  }
  if (sameRow) {
    const y = a[1] + H / 2 + 8;
    return { d: `M${a[0]},${y} L${b[0] + W},${y}`, lx: (a[0] + b[0] + W) / 2, ly: y + 16 };
  }
  if (b[1] > a[1]) {                                    // down to a revision node
    const sx = a[0] + W * 0.5, sy = a[1] + H, tx = b[0] + W * 0.82, ty = b[1];
    return { d: `M${sx},${sy} C${sx},${sy + 50} ${tx},${ty - 50} ${tx},${ty}`, lx: Math.max(sx, tx) + 12, ly: (sy + ty) / 2 + 4 };
  }
  const sx = a[0] + W * 0.18, sy = a[1], tx = b[0] + W / 2, ty = b[1] + H;   // up from a revision node
  return { d: `M${sx},${sy} C${sx},${sy - 50} ${tx},${ty + 50} ${tx},${ty}`, lx: Math.min(sx, tx) - 12, ly: (sy + ty) / 2 + 4 };
}

export function FlowCanvas({ model, selected, onSelect }: { model: WorkspaceModel; selected: string | null; onSelect: (id: string) => void }) {
  const pos = layout(model.nodes);
  const revisions = model.nodes.filter((n) => n.type === "revision").length;
  const height = Math.max(ROW2 + 20, ROW2 + revisions * ROW_STEP + 10);
  const width = 20 + MAIN.length * (W + GAP) - GAP + 20;

  const groups = new Map<string, WorkspaceModel["edges"]>();
  for (const e of model.edges) {
    const k = `${e.from}>${e.to}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }

  const key = (id: string) => (ev: KeyboardEvent) => {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSelect(id); }
  };

  return (
    <div className="canvas-scroll">
      <svg className="canvas" viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Planning workflow">
        <defs>
          {(["flow", "challenge", "escalation"] as const).map((k) => (
            <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className={`arrowhead arrowhead-${k}`} />
            </marker>
          ))}
        </defs>
        {[...groups.entries()].map(([k, es]) => {
          const first = es[0]!;
          const a = pos.get(first.from), b = pos.get(first.to);
          if (!a || !b) return null;
          const kind = ["challenge", "escalation"].includes(first.kind) ? first.kind : "flow";
          const g = edgePath(a, b, groups.has(`${first.to}>${first.from}`));
          const anchor = g.lx > Math.max(a[0], b[0]) + W * 0.6 ? "start" : g.lx < Math.min(a[0], b[0]) + W * 0.4 && a[1] !== b[1] ? "end" : "middle";
          return (
            <g key={k} className={`edge edge-${kind}`}>
              <path d={g.d} markerEnd={`url(#arrow-${kind})`} />
              <text x={g.lx} y={g.ly} textAnchor={anchor}>{es.map((e) => e.label).join(" · ").slice(0, 80)}</text>
            </g>
          );
        })}
        {model.nodes.map((n) => {
          const p = pos.get(n.id)!;
          const [l1, l2] = wrap(n.summary, 34);
          const isSel = selected === n.id;
          return (
            <g key={n.id} className={`node node-${tone(n.status)}${isSel ? " is-selected" : ""}`} transform={`translate(${p[0]},${p[1]})`}
              role="button" tabIndex={0} aria-pressed={isSel} aria-label={`${n.label}: ${n.status}. ${n.summary}`}
              onClick={() => onSelect(n.id)} onKeyDown={key(n.id)}>
              <rect width={W} height={H} rx="10" />
              <circle className="node-dot" cx="16" cy="20" r="4" />
              <text className="node-title" x="28" y="24">{n.label}</text>
              <text className="node-sum" x="16" y="46">{l1}</text>
              <text className="node-sum" x="16" y="62">{l2}</text>
              <text className="node-meta" x="16" y="81">{n.status}</text>
              <text className="node-meta" x={W - 14} y="81" textAnchor="end">{n.actor}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend" aria-hidden="true">
        <span className="lg-flow">step</span><span className="lg-challenge">reviewer challenge</span><span className="lg-escalation">escalation to human</span>
      </div>
    </div>
  );
}
