/**
 * Engine `qwen` — Qwen Code CLI.
 *
 * **Binary:** `qwen` (on `PATH`).
 *
 * **Process:** `qwen --output-format stream-json --approval-mode yolo <prompt>`
 * (prompt as argv; no stdin).
 *
 * **Stdout:** mixed line types — `assistant` lines reuse the same parser as
 * Claude stream-json (`emitClaudeStreamJsonLine`); `text` lines use
 * `part.text` like OpenCode.
 *
 * **Stderr:** forwarded as `log` events; tail used on non-zero exit.
 *
 * **Argv bridge:** `--output-format`, `stream-json`, `--approval-mode`, `yolo`,
 * then `ARGS_JSON` tokens, then the prompt argv.
 */

// qwen --help
// Usage: qwen [options] [command]

// Qwen Code - Launch an interactive CLI, use -p/--prompt for non-interactive mode

// Commands:
//   qwen [query..]             Launch Qwen Code CLI                                                                          [default]
//   qwen mcp                   Manage MCP servers
//   qwen extensions <command>  Manage Qwen Code extensions.
//   qwen auth                  Configure Qwen authentication information with Qwen-OAuth or Alibaba Cloud Coding Plan
//   qwen hooks                 Manage Qwen Code hooks (use /hooks in interactive mode).                                [aliases: hook]
//   qwen channel               Manage messaging channels (Telegram, Discord, etc.)

// Positionals:
//   query  Positional prompt. Defaults to one-shot; use -i/--prompt-interactive for interactive.

// Options:
//       --telemetry                       Enable telemetry? This flag specifically controls if telemetry is sent. Other --telemetry-*
//                                         flags set specific values but do not enable telemetry on their own.
//   [deprecated: Use the "telemetry.enabled" setting in settings.json instead. This flag will be removed in a future version.] [boolea
//                                                                                                                                   n]
//       --telemetry-target                Set the telemetry target (local or gcp). Overrides settings files.
//   [deprecated: Use the "telemetry.target" setting in settings.json instead. This flag will be removed in a future version.] [string]
//                                                                                                            [choices: "local", "gcp"]
//       --telemetry-otlp-endpoint         Set the OTLP endpoint for telemetry. Overrides environment variables and settings files.
//   [deprecated: Use the "telemetry.otlpEndpoint" setting in settings.json instead. This flag will be removed in a future version.] [s
//                                                                                                                               tring]
//       --telemetry-otlp-protocol         Set the OTLP protocol for telemetry (grpc or http). Overrides settings files.
//   [deprecated: Use the "telemetry.otlpProtocol" setting in settings.json instead. This flag will be removed in a future version.] [s
//                                                                                                     tring] [choices: "grpc", "http"]
//       --telemetry-log-prompts           Enable or disable logging of user prompts for telemetry. Overrides settings files.
//   [deprecated: Use the "telemetry.logPrompts" setting in settings.json instead. This flag will be removed in a future version.] [boo
//                                                                                                                                lean]
//       --telemetry-outfile               Redirect all telemetry output to the specified file.
//   [deprecated: Use the "telemetry.outfile" setting in settings.json instead. This flag will be removed in a future version.] [string
//                                                                                                                                    ]
//   -d, --debug                           Run in debug mode?                                                [boolean] [default: false]
//       --proxy                           Proxy for Qwen Code, like schema://user:password@host:port
//              [deprecated: Use the "proxy" setting in settings.json instead. This flag will be removed in a future version.] [string]
//       --chat-recording                  Enable chat recording to disk. If false, chat history is not saved and --continue/--resume w
//                                         ill not work.                                                                      [boolean]
//   -m, --model                           Model                                                                               [string]
//   -p, --prompt                          Prompt. Appended to input on stdin (if any).
//                             [deprecated: Use the positional prompt instead. This flag will be removed in a future version.] [string]
//   -i, --prompt-interactive              Execute the provided prompt and continue in interactive mode                        [string]
//       --system-prompt                   Override the main session system prompt for this run. Can be combined with --append-system-p
//                                         rompt.                                                                              [string]
//       --append-system-prompt            Append instructions to the main session system prompt for this run. Can be combined with --s
//                                         ystem-prompt.                                                                       [string]
//   -s, --sandbox                         Run in sandbox?                                                                    [boolean]
//       --sandbox-image                   Sandbox image URI.
//   [deprecated: Use the "tools.sandboxImage" setting in settings.json instead. This flag will be removed in a future version.] [strin
//                                                                                                                                   g]
//   -y, --yolo                            Automatically accept all actions (aka YOLO mode, see https://www.youtube.com/watch?v=xvFZjo5
//                                         PgG0 for more details)?                                           [boolean] [default: false]
//       --approval-mode                   Set the approval mode: plan (plan only), default (prompt for approval), auto-edit (auto-appr
//                                         ove edit tools), yolo (auto-approve all tools)
//                                                                           [string] [choices: "plan", "default", "auto-edit", "yolo"]
//       --checkpointing                   Enables checkpointing of file edits
//   [deprecated: Use the "general.checkpointing.enabled" setting in settings.json instead. This flag will be removed in a future versi
//                                                                                                      on.] [boolean] [default: false]
//       --acp                             Starts the agent in ACP mode                                                       [boolean]
//       --experimental-lsp                Enable experimental LSP (Language Server Protocol) feature for code intelligence
//                                                                                                           [boolean] [default: false]
//       --channel                         Channel identifier (VSCode, ACP, SDK, CI)   [string] [choices: "VSCode", "ACP", "SDK", "CI"]
//       --allowed-mcp-server-names        Allowed MCP server names                                                             [array]
//       --allowed-tools                   Tools to allow, will bypass confirmation                                             [array]
//   -e, --extensions                      A list of extensions to use. If not provided, all extensions are used.               [array]
//   -l, --list-extensions                 List all available extensions and exit.                                            [boolean]
//       --include-directories, --add-dir  Additional directories to include in the workspace (comma-separated or multiple --include-di
//                                         rectories)                                                                           [array]
//       --openai-logging                  Enable logging of OpenAI API calls for debugging and analysis                      [boolean]
//       --openai-logging-dir              Custom directory path for OpenAI API logs. Overrides settings files.                [string]
//       --openai-api-key                  OpenAI API key to use for authentication                                            [string]
//       --openai-base-url                 OpenAI base URL (for custom endpoints)                                              [string]
//       --tavily-api-key                  Tavily API key for web search                                                       [string]
//       --google-api-key                  Google Custom Search API key                                                        [string]
//       --google-search-engine-id         Google Custom Search Engine ID                                                      [string]
//       --web-search-default              Default web search provider (dashscope, tavily, google)                             [string]
//       --screen-reader                   Enable screen reader mode for accessibility.                                       [boolean]
//       --input-format                    The format consumed from standard input.
//                                                                          [string] [choices: "text", "stream-json"] [default: "text"]
//   -o, --output-format                   The format of the CLI output.              [string] [choices: "text", "json", "stream-json"]
//       --include-partial-messages        Include partial assistant messages when using stream-json output. [boolean] [default: false]
//   -c, --continue                        Resume the most recent session for the current project.           [boolean] [default: false]
//   -r, --resume                          Resume a specific session by its ID. Use without an ID to show session picker.      [string]
//       --session-id                      Specify a session ID for this run.                                                  [string]
//       --max-session-turns               Maximum number of session turns                                                     [number]
//       --core-tools                      Core tool paths                                                                      [array]
//       --exclude-tools                   Tools to exclude                                                                     [array]
//       --auth-type                       Authentication type
//                                                       [string] [choices: "openai", "anthropic", "qwen-oauth", "gemini", "vertex-ai"]
//   -v, --version                         Show version number                                                                [boolean]
//   -h, --help                            Show help                                                                          [boolean]


import { commandOnPath } from "../detect.js";
import { getEngineArgvExtras } from "../engine-env.js";
import { emitClaudeStreamJsonLine } from "./lib/claude-stream-json.js";
import { asStr, safeJsonParse } from "./lib/json.js";
import { finishCliRun } from "./lib/subprocess-finish.js";
import { runLineProcess } from "../spawn-helpers.js";
import type { EmitFn, EngineDefinition } from "../types.js";

async function emitQwenLine(line: string, emit: EmitFn): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;
  const o = safeJsonParse(trimmed);
  if (!o) return;
  if (asStr(o.type) === "assistant") {
    await emitClaudeStreamJsonLine(trimmed, emit);
    return;
  }
  if (asStr(o.type) === "text") {
    const part = o.part as Record<string, unknown> | undefined;
    const text = asStr(part?.text);
    if (text) await emit({ type: "delta", text });
  }
}

export function createQwenEngine(timeoutMs: number): EngineDefinition {
  const bin = "qwen";
  return {
    info: {
      id: "qwen",
      label: "Qwen Code",
      description: "Local `qwen` with stream-json output.",
      available: commandOnPath(bin),
    },
    async run(ctx) {
      const engineId = "qwen";
      const o = ctx.options;
      const approval = o?.approvalMode?.trim() || "yolo";
      const args = [
        "--output-format",
        "stream-json",
        "--approval-mode",
        approval,
        ...getEngineArgvExtras(engineId),
      ];
      if (o?.model) args.push("--model", o.model);
      args.push(ctx.message);
      let stderrBuf = "";
      const res = await runLineProcess({
        command: bin,
        args,
        cwd: ctx.cwd,
        engineId,
        timeoutMs,
        signal: ctx.signal,
        onStdoutLine: (line) => emitQwenLine(line, ctx.emit),
        onStderrChunk: async (c) => {
          stderrBuf += c;
          await ctx.emit({ type: "log", stream: "stderr", message: c });
        },
      });
      await finishCliRun(ctx.emit, ctx.signal, res, stderrBuf);
    },
  };
}
