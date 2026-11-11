/** Hash routing. The fragment never leaves the browser (not sent to the server, not in logs, not in a Referer), and every
 * part is validated against an allowlist before the app acts on it.
 *
 *   #/                          engagements (home)
 *   #/new                       new engagement
 *   #/account                   account (change password)
 *   #/e/<engagement>/<view>[/<node>]
 */
import { useSyncExternalStore } from "react";

export const VIEWS = ["overview", "queue", "findings", "plan", "documents", "activity"] as const;
export type View = (typeof VIEWS)[number];
export type Page = "engagements" | "new" | "account" | "engagement";

export interface Route {
  page: Page;
  engagement: string | null;
  view: View;
  node: string | null;
}

const NODE_ID = /^[a-z0-9-]{1,40}$/;
const MAX_NAME = 200;
const HOME: Route = { page: "engagements", engagement: null, view: "overview", node: null };

function decode(part: string | undefined): string | null {
  if (!part) return null;
  try {
    const v = decodeURIComponent(part);
    return v.length > 0 && v.length <= MAX_NAME ? v : null;
  } catch {
    return null;
  }
}

export function isView(v: string | null | undefined): v is View {
  return !!v && (VIEWS as readonly string[]).includes(v);
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/");
  const head = parts[0] ?? "";
  if (head === "new") return { ...HOME, page: "new" };
  if (head === "account") return { ...HOME, page: "account" };
  if (head === "e") {
    const engagement = decode(parts[1]);
    if (!engagement) return HOME;
    const view = decode(parts[2]);
    const node = decode(parts[3]);
    return { page: "engagement", engagement, view: isView(view) ? view : "overview", node: node && NODE_ID.test(node) ? node : null };
  }
  return HOME;
}

export function toHash(r: Partial<Route> & { page: Page }): string {
  if (r.page === "new") return "#/new";
  if (r.page === "account") return "#/account";
  if (r.page !== "engagement" || !r.engagement) return "#/";
  let h = `#/e/${encodeURIComponent(r.engagement)}/${r.view ?? "overview"}`;
  if (r.node && NODE_ID.test(r.node)) h += `/${r.node}`;
  return h;
}

export const engagementHref = (engagement: string, view: View = "overview"): string => toHash({ page: "engagement", engagement, view });

function subscribe(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  return parseHash(hash);
}

export function navigate(r: Partial<Route> & { page: Page }, replace = false): void {
  const h = toHash(r);
  if (replace) {
    window.history.replaceState(null, "", h);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else if (window.location.hash !== h) {
    window.location.hash = h;
  }
}
