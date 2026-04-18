/**
 * Engine `codex` — OpenAI Codex CLI.
 *
 * **Binary:** `codex` (on `PATH`).
 *
 * **Process:** `codex exec --json --dangerously-bypass-approvals-and-sandbox -`
 * (`-` = read prompt from stdin).
 *
 * **Stdin:** plain chat message string (single write, then closed).
 *
 * **Stdout:** NDJSON; `type === "item.completed"` with `item.type ===
 * "agent_message"` yields text deltas.
 *
 * **Stderr:** forwarded as `log` events; tail used on non-zero exit.
 *
 * **Argv bridge:** `exec`, `--json`, default flags, then `ARGS_JSON` tokens,
 * then `-` (stdin marker).
 */

// codex --help
// Codex CLI

// If no subcommand is specified, options will be forwarded to the interactive CLI.

// Usage: codex [OPTIONS] [PROMPT]
//        codex [OPTIONS] <COMMAND> [ARGS]

// Commands:
//   exec         Run Codex non-interactively [aliases: e]
//   review       Run a code review non-interactively
//   login        Manage login
//   logout       Remove stored authentication credentials
//   mcp          Manage external MCP servers for Codex
//   mcp-server   Start Codex as an MCP server (stdio)
//   app-server   [experimental] Run the app server or related tooling
//   app          Launch the Codex desktop app (downloads the macOS installer if missing)
//   completion   Generate shell completion scripts
//   sandbox      Run commands within a Codex-provided sandbox
//   debug        Debugging tools
//   apply        Apply the latest diff produced by Codex agent as a `git apply` to your local working tree [aliases: a]
//   resume       Resume a previous interactive session (picker by default; use --last to continue the most recent)
//   fork         Fork a previous interactive session (picker by default; use --last to fork the most recent)
//   cloud        [EXPERIMENTAL] Browse tasks from Codex Cloud and apply changes locally
//   exec-server  [EXPERIMENTAL] Run the standalone exec-server binary
//   features     Inspect feature flags
//   help         Print this message or the help of the given subcommand(s)

// Arguments:
//   [PROMPT]
//           Optional user prompt to start the session

// Options:
//   -c, --config <key=value>
//           Override a configuration value that would otherwise be loaded from `~/.codex/config.toml`. Use a dotted path
//           (`foo.bar.baz`) to override nested values. The `value` portion is parsed as TOML. If it fails to parse as TOML, the raw
//           string is used as a literal.
          
//           Examples: - `-c model="o3"` - `-c 'sandbox_permissions=["disk-full-read-access"]'` - `-c
//           shell_environment_policy.inherit=all`

//       --enable <FEATURE>
//           Enable a feature (repeatable). Equivalent to `-c features.<name>=true`

//       --disable <FEATURE>
//           Disable a feature (repeatable). Equivalent to `-c features.<name>=false`

//       --remote <ADDR>
//           Connect the TUI to a remote app server websocket endpoint.
          
//           Accepted forms: `ws://host:port` or `wss://host:port`.

//       --remote-auth-token-env <ENV_VAR>
//           Name of the environment variable containing the bearer token to send to a remote app server websocket

//   -i, --image <FILE>...
//           Optional image(s) to attach to the initial prompt

//   -m, --model <MODEL>
//           Model the agent should use

//       --oss
//           Convenience flag to select the local open source model provider. Equivalent to -c model_provider=oss; verifies a local LM
//           Studio or Ollama server is running

//       --local-provider <OSS_PROVIDER>
//           Specify which local provider to use (lmstudio or ollama). If not specified with --oss, will use config default or show
//           selection

//   -p, --profile <CONFIG_PROFILE>
//           Configuration profile from config.toml to specify default options

//   -s, --sandbox <SANDBOX_MODE>
//           Select the sandbox policy to use when executing model-generated shell commands
          
//           [possible values: read-only, workspace-write, danger-full-access]

//   -a, --ask-for-approval <APPROVAL_POLICY>
//           Configure when the model requires human approval before executing a command

//           Possible values:
//           - untrusted:  Only run "trusted" commands (e.g. ls, cat, sed) without asking for user approval. Will escalate to the user
//             if the model proposes a command that is not in the "trusted" set
//           - on-failure: DEPRECATED: Run all commands without asking for user approval. Only asks for approval if a command fails to
//             execute, in which case it will escalate to the user to ask for un-sandboxed execution. Prefer `on-request` for
//             interactive runs or `never` for non-interactive runs
//           - on-request: The model decides when to ask the user for approval
//           - never:      Never ask for user approval Execution failures are immediately returned to the model

//       --full-auto
//           Convenience alias for low-friction sandboxed automatic execution (-a on-request, --sandbox workspace-write)

//       --dangerously-bypass-approvals-and-sandbox
//           Skip all confirmation prompts and execute commands without sandboxing. EXTREMELY DANGEROUS. Intended solely for running in
//           environments that are externally sandboxed

//   -C, --cd <DIR>
//           Tell the agent to use the specified directory as its working root. In remote mode, the path is forwarded to the server and
//           resolved there

//       --search
//           Enable live web search. When enabled, the native Responses `web_search` tool is available to the model (no per‑call
//           approval)

//       --add-dir <DIR>
//           Additional directories that should be writable alongside the primary workspace

//       --no-alt-screen
//           Disable alternate screen mode
          
//           Runs the TUI in inline mode, preserving terminal scrollback history. This is useful in terminal multiplexers like Zellij
//           that follow the xterm spec strictly and disable scrollback in alternate screen buffers.

//   -h, --help
//           Print help (see a summary with '-h')

//   -V, --version
//           Print version


import { commandOnPath } from "../detect.js";
import { getEngineArgvExtras } from "../engine-env.js";
import { asStr, safeJsonParse } from "./lib/json.js";
import { finishCliRun } from "./lib/subprocess-finish.js";
import { runLineProcess } from "../spawn-helpers.js";
import type { EmitFn, EngineDefinition } from "../types.js";

async function emitCodexJsonLine(line: string, emit: EmitFn): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;
  const o = safeJsonParse(trimmed);
  if (!o) return;
  if (asStr(o.type) !== "item.completed") return;
  const item = o.item as Record<string, unknown> | undefined;
  if (!item || asStr(item.type) !== "agent_message") return;
  const text = asStr(item.text);
  if (text) await emit({ type: "delta", text });
}

export function createCodexEngine(timeoutMs: number): EngineDefinition {
  const bin = "codex";
  return {
    info: {
      id: "codex",
      label: "Codex CLI",
      description: "Local `codex exec --json` (stdin prompt).",
      available: commandOnPath(bin),
    },
    async run(ctx) {
      const engineId = "codex";
      const o = ctx.options;
      const args = [
        "exec",
        "--json",
        "--dangerously-bypass-approvals-and-sandbox",
        ...(o?.model ? ["--model", o.model] : []),
        ...getEngineArgvExtras(engineId),
        "-",
      ];
      let stderrBuf = "";
      const res = await runLineProcess({
        command: bin,
        args,
        cwd: ctx.cwd,
        stdinContent: ctx.message,
        engineId,
        timeoutMs,
        signal: ctx.signal,
        onStdoutLine: (line) => emitCodexJsonLine(line, ctx.emit),
        onStderrChunk: async (c) => {
          stderrBuf += c;
          await ctx.emit({ type: "log", stream: "stderr", message: c });
        },
      });
      await finishCliRun(ctx.emit, ctx.signal, res, stderrBuf);
    },
  };
}
