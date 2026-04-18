import { config } from "../config.js";
import { commandOnPath } from "./detect.js";
import { runCaptureOutput } from "./spawn-helpers.js";

export type EngineModelEntry = {
  id: string;
  label?: string;
};

export type EngineModelsPayload = {
  engineId: string;
  available: boolean;
  source: "cli" | "static";
  models: EngineModelEntry[];
  error?: string;
  note?: string;
};

const CAP_OUT = 2_000_000;
const CAP_ERR = 256_000;

const CLAUDE_STATIC: EngineModelEntry[] = [
  { id: "sonnet", label: "Sonnet (alias)" },
  { id: "opus", label: "Opus (alias)" },
  { id: "haiku", label: "Haiku (alias)" },
  { id: "claude-sonnet-4-6", label: "claude-sonnet-4-6" },
  { id: "claude-opus-4-6", label: "claude-opus-4-6" },
  { id: "claude-haiku-4-5", label: "claude-haiku-4-5" },
];

const CODEX_STATIC: EngineModelEntry[] = [
  { id: "gpt-5", label: "gpt-5" },
  { id: "gpt-5-codex", label: "gpt-5-codex" },
  { id: "gpt-5.1", label: "gpt-5.1" },
  { id: "gpt-4.1", label: "gpt-4.1" },
  { id: "o3", label: "o3" },
  { id: "o4-mini", label: "o4-mini" },
];

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-?]*[-/]*[@-~]/g, "");
}

export function parseAgentModelList(stdout: string): EngineModelEntry[] {
  const text = stripAnsi(stdout);
  const out: EngineModelEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || /^Available models$/i.test(trimmed)) continue;
    const m = trimmed.match(/^([a-z0-9][\w.-]*)\s+-\s+(.+)$/i);
    if (!m) continue;
    let label = m[2].trim();
    label = label
      .replace(/\s*\(current\)\s*$/i, "")
      .replace(/\s*\(default\)\s*$/i, "")
      .trim();
    out.push({ id: m[1], label });
  }
  return out;
}

export function parseOpencodeModelList(stdout: string): EngineModelEntry[] {
  const out: EngineModelEntry[] = [];
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    if (!t.includes("/")) continue;
    if (/\s/.test(t)) continue;
    out.push({ id: t });
  }
  return out;
}

export function parsePiModelList(stdout: string): EngineModelEntry[] {
  const lines = stdout.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return [];
  let start = 0;
  const head = lines[0].toLowerCase();
  if (head.includes("provider") && head.includes("model")) start = 1;
  const out: EngineModelEntry[] = [];
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const m = line.match(/^(\S+)\s+(\S+)/);
    if (!m) continue;
    const id = `${m[1]}/${m[2]}`;
    out.push({ id, label: m[2] });
  }
  return out;
}

async function probe(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}> {
  const r = await runCaptureOutput({
    command,
    args,
    cwd,
    env: { ...process.env, TERM: "xterm-256color" },
    timeoutMs,
    maxStdoutBytes: CAP_OUT,
    maxStderrBytes: CAP_ERR,
  });
  return {
    stdout: r.stdout,
    stderr: r.stderr,
    exitCode: r.exitCode,
    timedOut: r.timedOut,
  };
}

export async function listModelsForEngine(
  engineId: string,
): Promise<EngineModelsPayload> {
  const cwd = config.cwd;
  const timeoutMs = config.listModelsTimeoutMs;

  if (engineId === "claude") {
    const onPath = commandOnPath("claude");
    return {
      engineId,
      available: onPath,
      source: "static",
      models: CLAUDE_STATIC,
      note: onPath
        ? "Aliases from Claude Code `--model`; not exhaustive."
        : undefined,
    };
  }

  if (engineId === "codex") {
    const onPath = commandOnPath("codex");
    return {
      engineId,
      available: onPath,
      source: "static",
      models: CODEX_STATIC,
      note: onPath
        ? "Common Codex `exec` models; set any id your CLI accepts."
        : undefined,
    };
  }

  if (engineId === "cursor_agent") {
    if (!commandOnPath("agent")) {
      return { engineId, available: false, source: "cli", models: [] };
    }
    const r = await probe("agent", ["--list-models"], cwd, timeoutMs);
    const models = parseAgentModelList(r.stdout);
    const err =
      r.timedOut && models.length === 0
        ? "Timed out listing models (raise AGENT_DAEMON_LIST_MODELS_TIMEOUT_MS)."
        : r.exitCode !== 0 && models.length === 0
          ? trimErr(r.stderr || `exit ${r.exitCode}`)
          : undefined;
    return {
      engineId,
      available: true,
      source: "cli",
      models,
      error: err,
    };
  }

  if (engineId === "opencode") {
    if (!commandOnPath("opencode")) {
      return { engineId, available: false, source: "cli", models: [] };
    }
    const r = await probe("opencode", ["models"], cwd, timeoutMs);
    const models = parseOpencodeModelList(r.stdout);
    const err =
      r.timedOut && models.length === 0
        ? "Timed out listing models (raise AGENT_DAEMON_LIST_MODELS_TIMEOUT_MS)."
        : r.exitCode !== 0 && models.length === 0
          ? trimErr(r.stderr || `exit ${r.exitCode}`)
          : undefined;
    return {
      engineId,
      available: true,
      source: "cli",
      models,
      error: err,
    };
  }

  if (engineId === "pi") {
    if (!commandOnPath("pi")) {
      return { engineId, available: false, source: "cli", models: [] };
    }
    const r = await probe("pi", ["--list-models"], cwd, timeoutMs);
    const models = parsePiModelList(r.stdout);
    const err =
      r.timedOut && models.length === 0
        ? "Timed out listing models (raise AGENT_DAEMON_LIST_MODELS_TIMEOUT_MS)."
        : r.exitCode !== 0 && models.length === 0
          ? trimErr(r.stderr || `exit ${r.exitCode}`)
          : undefined;
    return {
      engineId,
      available: true,
      source: "cli",
      models,
      error: err,
    };
  }

  if (engineId === "qwen") {
    const onPath = commandOnPath("qwen");
    return {
      engineId,
      available: onPath,
      source: "static",
      models: [],
      note: onPath
        ? "Qwen CLI has no model list command; pass a known `--model` id or use "
          + "`AGENT_ENGINE_QWEN_ARGS_JSON`."
        : undefined,
    };
  }

  return {
    engineId,
    available: false,
    source: "static",
    models: [],
    error: `Unknown engine: ${engineId}`,
  };
}

function trimErr(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > 400 ? `${t.slice(0, 397)}...` : t;
}

const ENGINE_IDS = [
  "claude",
  "codex",
  "cursor_agent",
  "opencode",
  "pi",
  "qwen",
] as const;

export async function listModelsForAllEngines(): Promise<EngineModelsPayload[]> {
  const jobs = ENGINE_IDS.map((id) => listModelsForEngine(id));
  return Promise.all(jobs);
}
