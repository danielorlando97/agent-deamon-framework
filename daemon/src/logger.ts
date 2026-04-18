/**
 * Structured logs for the daemon.
 *
 * Env:
 * - AGENT_DAEMON_LOG_LEVEL: debug | info | warn | error (default: info)
 * - AGENT_DAEMON_LOG_FORMAT: text | json (default: text)
 * - AGENT_DAEMON_LOG_COLOR: 0 | 1 | unset (unset = colors when stderr is a TTY)
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const LEVEL_TAG: Record<LogLevel, string> = {
  debug: "DBG",
  info: "INF",
  warn: "WRN",
  error: "ERR",
};

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const;

function parseLogLevel(raw: string | undefined): LogLevel {
  const v = (raw ?? "info").trim().toLowerCase();
  if (
    v === "debug" ||
    v === "info" ||
    v === "warn" ||
    v === "error"
  ) {
    return v;
  }
  return "info";
}

function parseLogFormat(raw: string | undefined): "text" | "json" {
  return (raw ?? "text").trim().toLowerCase() === "json" ? "json" : "text";
}

function colorEnabled(): boolean {
  const raw = process.env.AGENT_DAEMON_LOG_COLOR?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "never") return false;
  if (raw === "1" || raw === "true" || raw === "always") return true;
  return process.stderr.isTTY === true;
}

function logFormatNow(): "text" | "json" {
  return parseLogFormat(process.env.AGENT_DAEMON_LOG_FORMAT);
}

function shouldEmit(level: LogLevel): boolean {
  const min = parseLogLevel(process.env.AGENT_DAEMON_LOG_LEVEL);
  return LEVEL_RANK[level] >= LEVEL_RANK[min];
}

function paintLevel(level: LogLevel, tag: string): string {
  if (!colorEnabled() || logFormatNow() === "json") return tag;
  switch (level) {
    case "debug":
      return `${ANSI.gray}${tag}${ANSI.reset}`;
    case "info":
      return `${ANSI.cyan}${tag}${ANSI.reset}`;
    case "warn":
      return `${ANSI.yellow}${tag}${ANSI.reset}`;
    case "error":
      return `${ANSI.red}${tag}${ANSI.reset}`;
    default:
      return tag;
  }
}

function dimTs(iso: string): string {
  if (!colorEnabled() || logFormatNow() === "json") return iso;
  return `${ANSI.dim}${iso}${ANSI.reset}`;
}

function serializeData(data: Record<string, unknown> | undefined): string {
  if (data === undefined || Object.keys(data).length === 0) return "";
  const norm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    norm[k] = v instanceof Error ? v.message : v;
  }
  try {
    return JSON.stringify(norm);
  } catch {
    return "{}";
  }
}

function emit(
  level: LogLevel,
  scope: string,
  msg: string,
  data?: Record<string, unknown>,
): void {
  if (!shouldEmit(level)) return;

  const ts = new Date().toISOString();
  const scopeShort = scope.length > 14 ? `${scope.slice(0, 11)}...` : scope;

  if (logFormatNow() === "json") {
    const line = JSON.stringify({
      ts,
      level,
      scope,
      msg,
      ...(data && Object.keys(data).length > 0 ? { data } : {}),
    });
    process.stderr.write(`${line}\n`);
    return;
  }

  const tag = paintLevel(level, LEVEL_TAG[level]);
  const meta = serializeData(data);
  const tail = meta ? ` │ ${meta}` : "";
  const line =
    `${dimTs(ts)} ${tag} ${scopeShort.padEnd(14)} ${msg}${tail}\n`;
  process.stderr.write(line);
}

export type Logger = {
  debug: (msg: string, data?: Record<string, unknown>) => void;
  info: (msg: string, data?: Record<string, unknown>) => void;
  warn: (msg: string, data?: Record<string, unknown>) => void;
  error: (msg: string, data?: Record<string, unknown>) => void;
};

export function createLogger(scope: string): Logger {
  return {
    debug: (msg, data) => emit("debug", scope, msg, data),
    info: (msg, data) => emit("info", scope, msg, data),
    warn: (msg, data) => emit("warn", scope, msg, data),
    error: (msg, data) => emit("error", scope, msg, data),
  };
}
