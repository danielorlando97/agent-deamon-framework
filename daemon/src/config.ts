function parseHost(raw: string | undefined, fallback: string): string {
  const v = (raw ?? "").trim();
  return v.length > 0 ? v : fallback;
}

function parsePort(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseMs(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  host: parseHost(process.env.AGENT_DAEMON_HOST, "127.0.0.1"),
  port: parsePort(process.env.AGENT_DAEMON_PORT, 8787),
  /** Default timeout for subprocess-based engines (ms). */
  chatTimeoutMs: parseMs(
    process.env.AGENT_DAEMON_TIMEOUT_MS,
    20 * 60 * 1000,
  ),
  /** Timeout for `GET /api/engine-models` CLI probes (ms). */
  listModelsTimeoutMs: parseMs(
    process.env.AGENT_DAEMON_LIST_MODELS_TIMEOUT_MS,
    45_000,
  ),
  cwd: (process.env.AGENT_DAEMON_CWD ?? process.cwd()).trim() || process.cwd(),
};
