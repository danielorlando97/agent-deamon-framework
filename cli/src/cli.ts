import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "log"; stream: "stdout" | "stderr"; message: string }
  | { type: "done" }
  | { type: "error"; message: string };

type EngineInfo = { id: string; available: boolean };

function tryFrameworkRoot(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 40; i++) {
    const daemonPkg = join(dir, "daemon", "package.json");
    const webPkg = join(dir, "web", "package.json");
    if (existsSync(daemonPkg) && existsSync(webPkg)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

function findFrameworkRoot(scriptDir: string): string {
  const envRoot = process.env.ADF_FRAMEWORK_ROOT?.trim();
  if (envRoot) {
    const resolved = resolvePath(envRoot);
    const found = tryFrameworkRoot(resolved);
    if (found) {
      return found;
    }
    throw new Error(
      `adf: ADF_FRAMEWORK_ROOT="${envRoot}" must point at the repo root ` +
        `(with daemon/ and web/).`,
    );
  }
  const fromCwd = tryFrameworkRoot(process.cwd());
  if (fromCwd) {
    return fromCwd;
  }
  const fromScript = tryFrameworkRoot(scriptDir);
  if (fromScript) {
    return fromScript;
  }
  throw new Error(
    "adf: could not find framework root (daemon/ + web/). cd into the " +
      "clone, or set ADF_FRAMEWORK_ROOT to that path (needed for global " +
      "npm install).",
  );
}

function parseDaemonPort(): number {
  const port = Number.parseInt(
    String(process.env.AGENT_DAEMON_PORT ?? "8787").trim(),
    10,
  );
  return Number.isFinite(port) && port > 0 ? port : 8787;
}

function parseWebDevPort(): number {
  const port = Number.parseInt(
    String(process.env.ADF_WEB_PORT ?? "5173").trim(),
    10,
  );
  return Number.isFinite(port) && port > 0 ? port : 5173;
}

function defaultBaseUrl(): string {
  const fromEnv = process.env.AGENT_DAEMON_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  const host = (process.env.AGENT_DAEMON_HOST ?? "127.0.0.1").trim();
  return `http://${host}:${parseDaemonPort()}`;
}

function parseSseBuffer(buf: string): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = [];
  const parts = buf.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const block of parts) {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data: ")) {
        continue;
      }
      const raw = line.slice(6).trim();
      if (!raw) {
        continue;
      }
      try {
        events.push(JSON.parse(raw) as StreamEvent);
      } catch {
        // ignore malformed SSE JSON
      }
    }
  }
  return { events, rest };
}

async function chatStream(
  baseUrl: string,
  engineId: string,
  message: string,
  onEvent: (e: StreamEvent) => void,
  signal?: AbortSignal,
  model?: string,
): Promise<void> {
  const root = baseUrl.replace(/\/$/, "");
  const body: Record<string, unknown> = { engineId, message };
  if (model?.trim()) {
    body.engineOptions = { model: model.trim() };
  }
  const res = await fetch(`${root}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`chat HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("chat: missing response body");
  }
  const dec = new TextDecoder();
  let carry = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    carry += dec.decode(value, { stream: true });
    const parsed = parseSseBuffer(carry);
    carry = parsed.rest;
    for (const ev of parsed.events) {
      onEvent(ev);
    }
  }
}

async function healthCheck(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/health`, {
      signal,
    });
    return res.ok;
  } catch {
    return false;
  }
}

type ParsedFlags = { url?: string; engine?: string; model?: string; rest: string[] };

function parseFlags(argv: string[]): ParsedFlags {
  const rest: string[] = [];
  let url: string | undefined;
  let engine: string | undefined;
  let model: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url" && argv[i + 1]) {
      url = argv[i + 1];
      i++;
    } else if (a === "--engine" && argv[i + 1]) {
      engine = argv[i + 1];
      i++;
    } else if (a === "--model" && argv[i + 1]) {
      model = argv[i + 1];
      i++;
    } else {
      rest.push(a);
    }
  }
  return { url, engine, model, rest };
}

function usage(program: string): string {
  return `${program} — agent daemon framework

Usage:
  adf run daemon          Start HTTP daemon (dev)
  adf run web             Start Vite web UI
  adf stop                Stop dev servers on daemon + web ports (see below)
  adf chat                Interactive console chat (daemon must be up)

Options:
  --url <base>            Daemon base URL
  --engine <id>           Initial engine (chat)
  --model <id>            Optional model id for chat (same as POST /api/chat)

Engines (engineId): claude, codex, cursor_agent, opencode, pi, qwen — use
  GET /api/engines for availability; see docs/QUICKSTART.md.

Framework root (for adf run daemon | web): repo folder with daemon/ and
  web/. Resolved from $ADF_FRAMEWORK_ROOT, then current directory (walk up),
  then the CLI install path. Global install: cd into the clone or set
  ADF_FRAMEWORK_ROOT.

Legacy binary agent-daemon-tty:
  (no args) | up          Start daemon in background if needed, then chat
  chat                    Chat only (daemon must be up)
  serve                   Foreground daemon (same as adf run daemon)
`;
}

function npmCmd(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function attachChildExit(child: ReturnType<typeof spawn>) {
  child.on("exit", (code, sig) => {
    const exitCode = code ?? (sig ? 1 : 0);
    process.exit(exitCode);
  });
}

function forwardSignalsToChild(child: ReturnType<typeof spawn>) {
  const forward = (sig: NodeJS.Signals) => {
    if (child.exitCode === null && child.signalCode == null) {
      try {
        child.kill(sig);
      } catch {
        // ignore
      }
    }
  };
  process.on("SIGINT", () => forward("SIGINT"));
  process.on("SIGTERM", () => forward("SIGTERM"));
}

function spawnForegroundNpm(cwd: string, script: string) {
  const child = spawn(npmCmd(), ["run", script], {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  forwardSignalsToChild(child);
  attachChildExit(child);
}

function getPidsListeningOnPort(port: number): number[] {
  if (process.platform === "win32") {
    try {
      const ps = [
        "-NoProfile",
        "-Command",
        `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue) | Select-Object -ExpandProperty OwningProcess -Unique`,
      ];
      const out = execFileSync("powershell", ps, {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      }).trim();
      if (!out) {
        return [];
      }
      const ids = new Set<number>();
      for (const line of out.split(/\r?\n/)) {
        const n = Number.parseInt(line.trim(), 10);
        if (Number.isFinite(n) && n > 0) {
          ids.add(n);
        }
      }
      return [...ids];
    } catch {
      return [];
    }
  }
  try {
    const out = execFileSync("lsof", ["-ti", `tcp:${port}`], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    }).trim();
    if (!out) {
      return [];
    }
    const ids = new Set<number>();
    for (const tok of out.split(/\s+/)) {
      const n = Number.parseInt(tok, 10);
      if (Number.isFinite(n) && n > 0) {
        ids.add(n);
      }
    }
    return [...ids];
  } catch {
    return [];
  }
}

function signalPids(pids: number[], sig: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, sig);
    } catch {
      // process may have exited
    }
  }
}

function stopPort(port: number, label: string): number {
  let pids = getPidsListeningOnPort(port);
  if (pids.length === 0) {
    console.info(`adf stop: nothing listening on ${label} (port ${port}).`);
    return 0;
  }
  console.info(
    `adf stop: sending SIGTERM to ${label} (port ${port}): ${pids.join(", ")}`,
  );
  signalPids(pids, "SIGTERM");
  return pids.length;
}

async function runStop(): Promise<void> {
  const daemonPort = parseDaemonPort();
  const webPort = parseWebDevPort();
  console.info(
    `adf stop: daemon port ${daemonPort} (AGENT_DAEMON_PORT), web port ` +
      `${webPort} (ADF_WEB_PORT).`,
  );
  const nWeb = stopPort(webPort, "web");
  const nDaemon = stopPort(daemonPort, "daemon");
  if (nWeb === 0 && nDaemon === 0) {
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 450));
  const afterWeb = getPidsListeningOnPort(webPort);
  const afterDaemon = getPidsListeningOnPort(daemonPort);
  const stubborn = [...new Set([...afterWeb, ...afterDaemon])];
  if (stubborn.length > 0) {
    console.info(
      `adf stop: still listening, sending SIGKILL: ${stubborn.join(", ")}`,
    );
    signalPids(stubborn, "SIGKILL");
  }
  process.exit(0);
}

async function startDaemonBackground(
  frameworkRoot: string,
  baseUrl: string,
) {
  const daemonDir = join(frameworkRoot, "daemon");
  const opts: Parameters<typeof spawn>[2] = {
    cwd: daemonDir,
    stdio: "ignore",
    env: process.env,
  };
  if (process.platform !== "win32") {
    opts.detached = true;
  }
  const child = spawn(npmCmd(), ["run", "dev"], opts);
  child.unref();
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    if (await healthCheck(baseUrl)) {
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    `Daemon did not become healthy at ${baseUrl} within timeout.`,
  );
}

async function loadEngines(baseUrl: string): Promise<EngineInfo[]> {
  const root = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${root}/api/engines`);
  if (!res.ok) {
    throw new Error(`GET /api/engines failed: ${res.status}`);
  }
  const data = (await res.json()) as { engines: EngineInfo[] };
  return data.engines ?? [];
}

function pickDefaultEngine(engines: EngineInfo[]): string {
  const first = engines.find((e) => e.available);
  if (first) {
    return first.id;
  }
  const any = engines[0];
  if (any) {
    return any.id;
  }
  return "claude";
}

async function runChatRepl(
  baseUrl: string,
  initialEngine: string | undefined,
  initialModel: string | undefined,
) {
  const root = baseUrl.replace(/\/$/, "");
  if (!(await healthCheck(root))) {
    console.error(
      `adf: daemon not reachable at ${root}. Start with: adf run daemon`,
    );
    process.exit(1);
  }
  let engines = await loadEngines(root);
  let engineId = initialEngine ?? pickDefaultEngine(engines);
  let modelId = (initialModel ?? "").trim();
  let active = engines.find((e) => e.id === engineId);
  if (!active?.available) {
    console.error(`adf: engine "${engineId}" is not available.`);
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.info(`Using engine: ${engineId} (${root})`);
  if (modelId) console.info(`Using model: ${modelId}`);
  console.info("Type /help for commands, /quit to exit.");

  let shuttingDown = false;
  let interfaceClosed = false;

  rl.on("close", () => {
    interfaceClosed = true;
    if (!shuttingDown) {
      process.exit(0);
    }
  });

  const handleLine = async (line: string): Promise<boolean> => {
    const input = line.trim();
    if (input === "/quit" || input === "/exit" || input === "/q") {
      shuttingDown = true;
      rl.close();
      process.exit(0);
      return false;
    }
    if (
      input === "" ||
      input === "/help" ||
      input === "?" ||
      input === "/?"
    ) {
      console.info(
        "  /engines /engine <id> /model <id>|clear /quit  |  plain text → chat",
      );
      return true;
    }
    if (input === "/engines" || input === "/refresh") {
      try {
        engines = await loadEngines(root);
        for (const e of engines) {
          console.info(`  ${e.id}${e.available ? "" : " (unavailable)"}`);
        }
      } catch (err) {
        console.error(err);
      }
      return true;
    }
    const m = input.match(/^\/(?:engine|use)\s+(\S+)/);
    if (m) {
      const id = m[1];
      const info = engines.find((e) => e.id === id);
      if (!info) {
        console.error(`Unknown engine: ${id}`);
      } else if (!info.available) {
        console.error(`Engine unavailable: ${id}`);
      } else {
        engineId = id;
        active = info;
        console.info(`Switched to engine: ${engineId}`);
      }
      return true;
    }
    if (input === "/model" || input === "/model show") {
      console.info(`  model: ${modelId || "(default)"}`);
      return true;
    }
    const mm = input.match(/^\/model\s+(.+)$/);
    if (mm) {
      const v = mm[1].trim();
      if (v === "clear" || v === '""') {
        modelId = "";
        console.info("  model cleared (engine default)");
      } else {
        modelId = v;
        console.info(`  model set: ${modelId}`);
      }
      return true;
    }

    const abort = new AbortController();
    const onSig = () => {
      abort.abort();
    };
    process.once("SIGINT", onSig);

    try {
      let lineOpen = false;
      await chatStream(
        root,
        engineId,
        input,
        (ev) => {
          if (ev.type === "delta") {
            if (!lineOpen) {
              process.stdout.write("\n");
              lineOpen = true;
            }
            process.stdout.write(ev.text);
          } else if (ev.type === "log") {
            const dest =
              ev.stream === "stderr" ? process.stderr : process.stdout;
            dest.write(`[${ev.stream}] ${ev.message}\n`);
          } else if (ev.type === "error") {
            console.error(`\nerror: ${ev.message}`);
          } else if (ev.type === "done") {
            if (lineOpen) {
              process.stdout.write("\n");
            }
            lineOpen = false;
          }
        },
        abort.signal,
        modelId || undefined,
      );
      process.stdout.write("\n");
    } catch (err) {
      const aborted =
        (err instanceof Error && err.name === "AbortError") ||
        (typeof err === "object" &&
          err !== null &&
          "name" in err &&
          (err as { name: string }).name === "AbortError");
      if (aborted) {
        console.info("(aborted)");
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Request failed: ${msg}`);
      }
    } finally {
      process.off("SIGINT", onSig);
    }

    return true;
  };

  const prompt = () => {
    if (shuttingDown || interfaceClosed) {
      return;
    }
    rl.question("> ", (line) => {
      void handleLine(line)
        .then((again) => {
          if (again && !shuttingDown) {
            prompt();
          }
        })
        .catch((err) => {
          console.error(err);
          if (!shuttingDown) {
            prompt();
          }
        });
    });
  };

  prompt();
}

function isTtyLegacy(programPath: string): boolean {
  const base = programPath.split(/[/\\]/).pop() ?? "";
  return base === "agent-daemon-tty" || base.includes("agent-daemon-tty");
}

async function main() {
  const programPath = process.argv[1] ?? "";
  const programName = programPath.split(/[/\\]/).pop() ?? "adf";
  const ttyLegacy = isTtyLegacy(programPath);

  const { url: flagUrl, engine: flagEngine, model: flagModel, rest } =
    parseFlags(process.argv.slice(2));
  const baseUrl = (flagUrl ?? defaultBaseUrl()).replace(/\/$/, "");

  const scriptFile = fileURLToPath(import.meta.url);
  const here = dirname(scriptFile);
  const frameworkRoot = findFrameworkRoot(here);
  const daemonDir = join(frameworkRoot, "daemon");
  const webDir = join(frameworkRoot, "web");

  if (ttyLegacy) {
    const h = rest[0];
    if (h === "help" || h === "--help" || h === "-h") {
      console.info(usage("agent-daemon-tty"));
      process.exit(0);
    }
    if (h === "chat") {
      await runChatRepl(baseUrl, flagEngine, flagModel);
      return;
    }
    if (h === "serve") {
      spawnForegroundNpm(daemonDir, "dev");
      return;
    }
    if (h === undefined || h === "up") {
      if (!(await healthCheck(baseUrl))) {
        console.info("Starting daemon in background…");
        await startDaemonBackground(frameworkRoot, baseUrl);
      }
      await runChatRepl(baseUrl, flagEngine, flagModel);
      return;
    }
    console.error(`Unknown agent-daemon-tty command: ${h}`);
    process.exit(1);
  }

  if (
    rest.length === 0 ||
    rest[0] === "help" ||
    rest[0] === "--help" ||
    rest[0] === "-h"
  ) {
    console.info(usage(programName));
    process.exit(0);
  }

  if (rest[0] === "run" && rest[1] === "daemon") {
    spawnForegroundNpm(daemonDir, "dev");
    return;
  }
  if (rest[0] === "run" && rest[1] === "web") {
    spawnForegroundNpm(webDir, "dev");
    return;
  }
  if (rest[0] === "stop") {
    if (rest.length !== 1) {
      console.error("adf stop does not take extra arguments.\n");
      console.info(usage(programName));
      process.exit(1);
    }
    await runStop();
    return;
  }
  if (rest[0] === "chat") {
    await runChatRepl(baseUrl, flagEngine, flagModel);
    return;
  }

  console.error(`Unknown command: ${rest.join(" ")}\n`);
  console.info(usage(programName));
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
