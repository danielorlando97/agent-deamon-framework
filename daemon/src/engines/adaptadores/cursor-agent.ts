/**
 * Engine `cursor_agent` — Cursor headless agent CLI.
 *
 * **Binary:** `agent` (on `PATH`; Cursor CLI).
 *
 * **Process:** `agent -p --output-format stream-json --stream-partial-output
 * --yolo --workspace <cwd>`
 *
 * **Stdin:** plain chat message string.
 *
 * **Stdout:** one JSON object per line; `type === "assistant"` → text extracted
 * from `message` (string or structured content with `output_text` / `text`).
 *
 * **Stderr:** forwarded as `log` events; tail used on non-zero exit.
 *
 * **Argv bridge:** defaults including `--workspace <cwd>`, then `ARGS_JSON`
 * tokens (stdin still carries the message).
 */

// agent --help
// Usage: agent [options] [command] [prompt...]

// Start the Cursor Agent

// Arguments:
//   prompt                       Initial prompt for the agent

// Options:
//   -v, --version                Output the version number
//   --api-key <key>              API key for authentication (can also use CURSOR_API_KEY env var)
//   -H, --header <header>        Add custom header to agent requests (format: 'Name: Value', can be used multiple times)
//   -p, --print                  Print responses to console (for scripts or non-interactive use). Has access to all tools, including
//                                write and shell. (default: false)
//   --output-format <format>     Output format (only works with --print): text | json | stream-json (default: "text")
//   --stream-partial-output      Stream partial output as individual text deltas (only works with --print and stream-json format)
//                                (default: false)
//   -c, --cloud                  Start in cloud mode (open composer picker on launch) (default: false)
//   --mode <mode>                Start in the given execution mode. plan: read-only/planning (analyze, propose plans, no edits). ask:
//                                Q&A style for explanations and questions (read-only). (choices: "plan", "ask")
//   --plan                       Start in plan mode (shorthand for --mode=plan). Ignored if --cloud is passed. (default: false)
//   --resume [chatId]            Select a session to resume (default: false)
//   --continue                   Continue previous session (default: false)
//   --model <model>              Model to use (e.g., gpt-5, sonnet-4, sonnet-4-thinking)
//   --list-models                List available models and exit (default: false)
//   -f, --force                  Force allow commands unless explicitly denied (default: false)
//   --yolo                       Alias for --force (Run Everything) (default: false)
//   --sandbox <mode>             Explicitly enable or disable sandbox mode (overrides config) (choices: "enabled", "disabled")
//   --approve-mcps               Automatically approve all MCP servers (default: false)
//   --trust                      Trust the current workspace without prompting (only works with --print/headless mode) (default:
//                                false)
//   --workspace <path>           Workspace directory to use (defaults to current working directory)
//   -w, --worktree [name]        Start in an isolated git worktree at ~/.cursor/worktrees/<reponame>/<name>. If omitted, a name is
//                                generated.
//   --worktree-base <branch>     Branch or ref to base the new worktree on (default: current HEAD)
//   --skip-worktree-setup        Skip running worktree setup scripts from .cursor/worktrees.json (default: false)
//   -h, --help                   Display help for command

// Commands:
//   install-shell-integration    Install shell integration to ~/.zshrc
//   uninstall-shell-integration  Remove shell integration from ~/.zshrc
//   login                        Authenticate with Cursor. Set NO_OPEN_BROWSER to disable browser opening.
//   logout                       Sign out and clear stored authentication
//   mcp                          Manage MCP servers
//   status|whoami [options]      View authentication status
//   models                       List available models for this account
//   about [options]              Display version, system, and account information
//   update                       Update Cursor Agent to the latest version
//   create-chat                  Create a new empty chat and return its ID
//   generate-rule|rule           Generate a new Cursor rule with interactive prompts
//   agent [prompt...]            Start the Cursor Agent
//   ls                           Resume a chat session
//   resume                       Resume the latest chat session
//   help [command]               Display help for command









import { commandOnPath } from "../detect.js";
import { getEngineArgvExtras } from "../engine-env.js";
import { asStr, safeJsonParse } from "./lib/json.js";
import { finishCliRun } from "./lib/subprocess-finish.js";
import { runLineProcess } from "../spawn-helpers.js";
import type { EmitFn, EngineDefinition } from "../types.js";

function collectCursorAssistantText(message: unknown): string[] {
  if (typeof message === "string") {
    const t = message.trim();
    return t ? [t] : [];
  }
  if (!message || typeof message !== "object") return [];
  const rec = message as Record<string, unknown>;
  const lines: string[] = [];
  const direct = asStr(rec.text).trim();
  if (direct) lines.push(direct);
  const content = Array.isArray(rec.content) ? rec.content : [];
  for (const partRaw of content) {
    const part = partRaw as Record<string, unknown>;
    const pt = asStr(part.type);
    if (pt === "output_text" || pt === "text") {
      const tx = asStr(part.text).trim();
      if (tx) lines.push(tx);
    }
  }
  return lines;
}

async function emitCursorAgentLine(line: string, emit: EmitFn): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;
  const o = safeJsonParse(trimmed);
  if (!o) return;
  const ty = asStr(o.type);
  if (ty === "thinking") {
    const sub = asStr(o.subtype);
    if (sub === "delta" && asStr(o.text)) {
      await emit({ type: "thinking_delta", text: asStr(o.text) });
    }
    if (sub === "completed") await emit({ type: "thinking_done" });
    return;
  }
  if (ty === "tool_call") {
    const sub = asStr(o.subtype);
    const tc = o.tool_call as Record<string, unknown> | undefined;
    let name = "tool";
    let detail = "";
    if (tc && typeof tc === "object") {
      const keys = Object.keys(tc).filter((k) => k !== "__proto__");
      if (keys.length) {
        name = keys[0];
        const payload = tc[keys[0]];
        try {
          detail =
            typeof payload === "object" && payload !== null
              ? JSON.stringify(payload).slice(0, 900)
              : String(payload).slice(0, 900);
        } catch {
          detail = "";
        }
      }
    }
    if (sub === "started") {
      await emit({ type: "tool", phase: "start", name, detail });
    }
    if (sub === "completed") {
      await emit({ type: "tool", phase: "end", name, detail, ok: true });
    }
    return;
  }
  if (ty === "assistant") {
    for (const t of collectCursorAssistantText(o.message)) {
      await emit({ type: "delta", text: t });
    }
  }
}

export function createCursorAgentEngine(timeoutMs: number): EngineDefinition {
  const bin = "agent";
  return {
    info: {
      id: "cursor_agent",
      label: "Cursor Agent",
      description: "Local Cursor `agent` CLI (stream-json, headless).",
      available: commandOnPath(bin),
    },
    async run(ctx) {
      const engineId = "cursor_agent";
      const o = ctx.options;
      const args = [
        "-p",
        "--output-format",
        "stream-json",
        ...(o?.streamPartialOutput === false ? [] : ["--stream-partial-output"]),
        "--yolo",
        "--workspace",
        ctx.cwd,
      ];
      if (o?.executionMode) args.push("--mode", o.executionMode);
      if (o?.sessionId) args.push("--resume", o.sessionId);
      else if (typeof o?.resume === "string") args.push("--resume", o.resume);
      else if (o?.resume === true) args.push("--continue");
      if (o?.model) args.push("--model", o.model);
      args.push(...getEngineArgvExtras(engineId));
      let stderrBuf = "";
      const res = await runLineProcess({
        command: bin,
        args,
        cwd: ctx.cwd,
        stdinContent: ctx.message,
        engineId,
        timeoutMs,
        signal: ctx.signal,
        onStdoutLine: (line) => emitCursorAgentLine(line, ctx.emit),
        onStderrChunk: async (c) => {
          stderrBuf += c;
          await ctx.emit({ type: "log", stream: "stderr", message: c });
        },
      });
      await finishCliRun(ctx.emit, ctx.signal, res, stderrBuf);
    },
  };
}
