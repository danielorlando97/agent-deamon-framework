import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { resolveWorkspacePath, validateEnginePaths } from "./chat-paths.js";
import { config } from "./config.js";
import { listWorkspaceDirs } from "./workspace-browser.js";
import { createLogger } from "./logger.js";
import { chatBodySchema, mergeEngineOptions } from "./schemas.js";
import { listModelsForAllEngines } from "./engines/list-models.js";
import { getEngine, listEngineInfos } from "./engines/registry.js";
import type { StreamEvent } from "./engines/types.js";

const log = createLogger("daemon");
const httpLog = createLogger("http");
const chatLog = createLogger("chat");

const app = new Hono();

app.use("/api/*", async (c, next) => {
  const t0 = Date.now();
  await next();
  const ms = Date.now() - t0;
  httpLog.info(`${c.req.method} ${c.req.path}`, {
    status: c.res.status,
    ms,
  });
});

app.use(
  "/api/*",
  cors({
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
  }),
);

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/workspace", (c) => {
  return c.json({ root: config.cwd });
});

app.get("/api/workspace/list", async (c) => {
  const rawRel = c.req.query("rel") ?? "";
  try {
    const payload = await listWorkspaceDirs(config.cwd, rawRel);
    return c.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

app.get("/api/engines", (c) => {
  return c.json({ engines: listEngineInfos() });
});

app.get("/api/engine-models", async (c) => {
  const engines = await listModelsForAllEngines();
  return c.json({ engines });
});

app.post("/api/chat", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = chatBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const { engineId, message } = parsed.data;
  const engineOptions = mergeEngineOptions(parsed.data);
  const pathErr = validateEnginePaths(config.cwd, engineOptions);
  if (pathErr) {
    return c.json({ error: pathErr }, 400);
  }

  const engine = getEngine(engineId);
  if (!engine) {
    return c.json({ error: `Unknown engine: ${engineId}` }, 404);
  }
  if (!engine.info.available) {
    return c.json({ error: `Engine unavailable: ${engineId}` }, 400);
  }

  const runCwd = engineOptions?.cwd?.trim()
    ? resolveWorkspacePath(config.cwd, engineOptions.cwd)
    : config.cwd;

  const timeoutMs = config.chatTimeoutMs;

  const signal = c.req.raw.signal;

  return streamSSE(c, async (stream) => {
    const emit = async (ev: StreamEvent) => {
      await stream.writeSSE({
        data: JSON.stringify(ev),
      });
    };

    chatLog.info("sse_start", { engineId, cwd: runCwd });
    try {
      await engine.run({
        message,
        cwd: runCwd,
        timeoutMs,
        signal,
        emit,
        options: engineOptions,
      });
      chatLog.debug("sse_done", { engineId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      chatLog.error("sse_engine_error", { engineId, error: msg });
      await emit({ type: "error", message: msg });
    }
  });
});

serve(
  {
    fetch: app.fetch,
    hostname: config.host,
    port: config.port,
  },
  (info) => {
    log.info("listening", {
      url: `http://${info.address}:${info.port}`,
      cwd: config.cwd,
    });
  },
);
