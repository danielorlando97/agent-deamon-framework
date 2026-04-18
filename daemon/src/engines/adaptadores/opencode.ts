/**
 * Engine `opencode` — OpenCode CLI.
 *
 * **Binary:** `opencode` (on `PATH`).
 *
 * **Process:** `opencode run --format json <prompt>` (prompt as argv, not
 * stdin). Environment sets `OPENCODE_PERMISSION` to allow actions for headless
 * runs.
 *
 * **Stdout:** one JSON object per line; `type === "text"` with `part.text`
 * yields deltas.
 *
 * **Stderr:** forwarded as `log` events; tail used on non-zero exit.
 *
 * **Argv bridge:** `run`, `--format`, `json`, then `ARGS_JSON` tokens, then the
 * prompt argv. Child env: `process.env` plus fixed `OPENCODE_PERMISSION` only.
 */

// opencode --help
// ▄     
// █▀▀█ █▀▀█ █▀▀█ █▀▀▄ █▀▀▀ █▀▀█ █▀▀█ █▀▀█
// █  █ █  █ █▀▀▀ █  █ █    █  █ █  █ █▀▀▀
// ▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀

// Commands:
// opencode completion          generate shell completion script
// opencode acp                 start ACP (Agent Client Protocol) server
// opencode mcp                 manage MCP (Model Context Protocol) servers
// opencode [project]           start opencode tui                                          [default]
// opencode attach <url>        attach to a running opencode server
// opencode run [message..]     run opencode with a message
// opencode debug               debugging and troubleshooting tools
// opencode providers           manage AI providers and credentials                   [aliases: auth]
// opencode agent               manage agents
// opencode upgrade [target]    upgrade opencode to the latest or a specific version
// opencode uninstall           uninstall opencode and remove all related files
// opencode serve               starts a headless opencode server
// opencode web                 start opencode server and open web interface
// opencode models [provider]   list all available models
// opencode stats               show token usage and cost statistics
// opencode export [sessionID]  export session data as JSON
// opencode import <file>       import session data from JSON file or URL
// opencode github              manage GitHub agent
// opencode pr <number>         fetch and checkout a GitHub PR branch, then run opencode
// opencode session             manage sessions
// opencode plugin <module>     install plugin and update config                      [aliases: plug]
// opencode db                  database tools

// Positionals:
// project  path to start opencode in                                                        [string]

// Options:
// -h, --help         show help                                                             [boolean]
// -v, --version      show version number                                                   [boolean]
// --print-logs   print logs to stderr                                                  [boolean]
// --log-level    log level                  [string] [choices: "DEBUG", "INFO", "WARN", "ERROR"]
// --pure         run without external plugins                                          [boolean]
// --port         port to listen on                                         [number] [default: 0]
// --hostname     hostname to listen on                           [string] [default: "127.0.0.1"]
// --mdns         enable mDNS service discovery (defaults hostname to 0.0.0.0)
//                                          [boolean] [default: false]
// --mdns-domain  custom domain name for mDNS service (default: opencode.local)
//                                [string] [default: "opencode.local"]
// --cors         additional domains to allow for CORS                      [array] [default: []]
// -m, --model        model to use in the format of provider/model                           [string]
// -c, --continue     continue the last session                                             [boolean]
// -s, --session      session id to continue                                                 [string]
// --fork         fork the session when continuing (use with --continue or --session)   [boolean]
// --prompt       prompt to use                                                          [string]
// --agent        agent to use                                                           [string]%   



import { commandOnPath } from "../detect.js";
import { getEngineArgvExtras } from "../engine-env.js";
import { asStr, safeJsonParse } from "./lib/json.js";
import { finishCliRun } from "./lib/subprocess-finish.js";
import { runLineProcess } from "../spawn-helpers.js";
import type { EmitFn, EngineDefinition } from "../types.js";

async function emitOpencodeLine(line: string, emit: EmitFn): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;
  const o = safeJsonParse(trimmed);
  if (!o) return;
  const ty = asStr(o.type);
  if (ty === "text") {
    const part = o.part as Record<string, unknown> | undefined;
    const text = asStr(part?.text);
    if (text) await emit({ type: "delta", text });
    return;
  }
  if (ty === "tool_use") {
    const part = o.part as Record<string, unknown> | undefined;
    const tool = asStr(part?.tool);
    if (!tool) return;
    const state = part?.state as Record<string, unknown> | undefined;
    const status = asStr(state?.status);
    let detail = "";
    const input = state?.input;
    try {
      detail =
        typeof input === "object" && input !== null
          ? JSON.stringify(input).slice(0, 500)
          : String(input ?? "").slice(0, 500);
    } catch {
      detail = "";
    }
    await emit({
      type: "tool",
      phase: "start",
      name: tool,
      detail: detail || status,
    });
    const errRaw = state?.error;
    const errMsg =
      typeof errRaw === "string"
        ? errRaw.slice(0, 500)
        : errRaw !== undefined && errRaw !== null
          ? JSON.stringify(errRaw).slice(0, 300)
          : "";
    const ok = status === "completed";
    await emit({
      type: "tool",
      phase: "end",
      name: tool,
      detail: ok ? detail || status : errMsg || detail || status,
      ok,
    });
  }
}

export function createOpencodeEngine(timeoutMs: number): EngineDefinition {
  const bin = "opencode";
  return {
    info: {
      id: "opencode",
      label: "OpenCode",
      description: "Local `opencode run --format json` with prompt arg.",
      available: commandOnPath(bin),
    },
    async run(ctx) {
      const engineId = "opencode";
      const o = ctx.options;
      const args = [
        "run",
        "--format",
        "json",
        ...getEngineArgvExtras(engineId),
      ];
      if (o?.continueSession) args.push("-c");
      if (o?.sessionId) args.push("-s", o.sessionId);
      if (o?.variant) args.push("--variant", o.variant);
      if (o?.model) args.push("--model", o.model);
      args.push(ctx.message);
      const env = {
        ...process.env,
        OPENCODE_PERMISSION: JSON.stringify({ "*": "allow" }),
      };
      let stderrBuf = "";
      const res = await runLineProcess({
        command: bin,
        args,
        cwd: ctx.cwd,
        env,
        engineId,
        timeoutMs,
        signal: ctx.signal,
        onStdoutLine: (line) => emitOpencodeLine(line, ctx.emit),
        onStderrChunk: async (c) => {
          stderrBuf += c;
          await ctx.emit({ type: "log", stream: "stderr", message: c });
        },
      });
      await finishCliRun(ctx.emit, ctx.signal, res, stderrBuf);
    },
  };
}
