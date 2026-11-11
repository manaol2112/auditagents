/** HTTP server for the Planning Workforce workspace: the web UI, the workspace read model, and the back-end API (src/api.ts).
 * Every API request is authenticated and scoped to the engagements the user is a member of.
 * Every response carries the security baseline in security.ts (host allowlist, fetch metadata, CSP, no-store). */
import fastifyStatic from "@fastify/static";
import Fastify, { FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { EngineError, connect } from "./db.js";
import { ApiOptions, registerApi } from "./api.js";
import { registerSecurity } from "./security.js";
import * as workspace from "./workspace.js";

/** The compiled web UI (`npm run build:web` writes web/dist). Resolves from both src/ (tsx) and dist/ (compiled). */
export const UI_DIR = resolve(process.env.UI_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "web", "dist"));

const NOT_BUILT = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Planning Workforce</title></head>
<body><h1>Planning Workforce</h1><p>The web UI has not been built. Run <code>npm run build:web</code>, then restart the server.</p></body></html>`;

export function buildServer(pool: pg.Pool, uiDir: string = UI_DIR, api: ApiOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 1024, maxParamLength: 200 });
  registerSecurity(app);
  // Method checks, sign-in, CSRF, and per-engagement access for every /api route; non-API paths stay GET-only (src/api.ts).
  registerApi(app, pool, api);
  if (existsSync(join(uiDir, "index.html"))) {
    // wildcard: false routes only the files present at startup, so nothing outside the build can ever be served.
    app.register(fastifyStatic, { root: uiDir, index: ["index.html"], serve: true, wildcard: false, cacheControl: false, dotfiles: "deny" });
  } else {
    app.get("/", async (_req, reply) => reply.type("text/html; charset=utf-8").send(NOT_BUILT));
  }
  app.get("/api/engagements", async (req) => workspace.listEngagements(pool, req.user!.name));
  app.get("/api/workspace/:engagement", async (req, reply) => {
    const { engagement } = req.params as { engagement: string };
    try {
      return await workspace.buildModel(pool, engagement);
    } catch (e) {
      if (e instanceof EngineError) return reply.code(404).send({ error: "unknown engagement" });   // never echo input back
      throw e;
    }
  });
  app.get("/healthz", async () => ({ ok: true }));
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: "not found" }));
  return app;
}

export async function serve(pool: pg.Pool, port: number, host = "127.0.0.1"): Promise<FastifyInstance> {
  const app = buildServer(pool);
  await app.listen({ port, host });
  return app;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const pool = connect();
  const port = Number(process.env.PORT ?? 8765);
  const host = process.env.HOST ?? "127.0.0.1";
  serve(pool, port, host).then(() => console.log(`workspace and API on http://${host}:${port}/ (sign-in required)`)).catch((e) => { console.error(e); process.exit(1); });
}
