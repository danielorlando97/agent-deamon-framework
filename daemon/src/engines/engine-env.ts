/**
 * Per-engine extra CLI argv via `process.env` (flags only, e.g. `--model`).
 *
 * Encoding: public `engineId` → uppercase; non-alphanumerics → `_`
 * (e.g. `cursor_agent` → `CURSOR_AGENT`).
 *
 * Variable: `AGENT_ENGINE_<SUFFIX>_ARGS_JSON` — JSON array of strings merged
 * into the subprocess argv (see each adapter for merge order).
 *
 * Caps: see `ENGINE_ARGV_LIMITS`.
 *
 * Debug — raw CLI stdout before adapter parsing (NDJSON, one file per run):
 * `AGENT_DAEMON_ENGINE_RAW_STREAM_LOG` = absolute or relative directory path.
 * Each subprocess run writes `<engineId>-<iso>-<id>.ndjson` with exact stdout
 * lines (same bytes the readline handler sees, plus newline).
 */

import { Buffer } from "node:buffer";
import { resolve } from "node:path";

import { createLogger } from "../logger.js";
import type { EngineIntegrationInfo } from "./types.js";

const log = createLogger("engine-env");

export const ENGINE_ARGV_LIMITS = {
  maxArgsJsonBytes: 262_144,
  maxArgvTokens: 64,
  maxArgvTokenUtf8Bytes: 8192,
} as const;

function warnEngineEnv(engineId: string, message: string): void {
  log.warn(message, { engineId });
}

export function engineIdToEnvSuffix(engineId: string): string {
  return engineId.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

export function engineIntegrationMeta(
  engineId: string,
): EngineIntegrationInfo {
  const engineIdEnvSuffix = engineIdToEnvSuffix(engineId);
  return {
    argvJsonEnvKey: `AGENT_ENGINE_${engineIdEnvSuffix}_ARGS_JSON`,
    engineIdEnvSuffix,
  };
}

function truncateUtf8(s: string, maxBytes: number): string {
  const buf = Buffer.from(s, "utf8");
  if (buf.length <= maxBytes) return s;
  let end = maxBytes;
  while (end > 0 && (buf[end - 1] & 0xc0) === 0x80) end -= 1;
  return buf.subarray(0, end).toString("utf8");
}

/**
 * Parses `ARGS_JSON`. On invalid input logs and returns `null` (no extras).
 */
export function parseArgsJson(
  raw: string | undefined,
  engineId: string,
): string[] | null {
  if (raw === undefined || raw.trim() === "") return null;
  const { maxArgsJsonBytes, maxArgvTokens, maxArgvTokenUtf8Bytes } =
    ENGINE_ARGV_LIMITS;
  if (Buffer.byteLength(raw, "utf8") > maxArgsJsonBytes) {
    warnEngineEnv(engineId, "ARGS_JSON exceeds max byte size; ignoring");
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    warnEngineEnv(engineId, "ARGS_JSON is not valid JSON; ignoring");
    return null;
  }
  if (!Array.isArray(parsed)) {
    warnEngineEnv(engineId, "ARGS_JSON must be a JSON array; ignoring");
    return null;
  }
  const out: string[] = [];
  const n = Math.min(parsed.length, maxArgvTokens);
  for (let i = 0; i < n; i += 1) {
    const el = parsed[i];
    if (typeof el !== "string") {
      warnEngineEnv(engineId, "ARGS_JSON must be an array of strings; ignoring");
      return null;
    }
    if (/[\r\n]/.test(el)) {
      warnEngineEnv(engineId, "ARGS_JSON tokens must not contain CR/LF; ignoring");
      return null;
    }
    out.push(truncateUtf8(el, maxArgvTokenUtf8Bytes));
  }
  return out;
}

function readEnvRaw(key: string): string | undefined {
  return process.env[key];
}

/**
 * Directory for raw per-line engine stdout captures; `null` if disabled.
 */
export function getEngineRawStreamLogDir(): string | null {
  const v = process.env.AGENT_DAEMON_ENGINE_RAW_STREAM_LOG?.trim();
  if (!v) return null;
  return resolve(v);
}

/** Extra argv tokens for `engineId` (may be empty). */
export function getEngineArgvExtras(engineId: string): string[] {
  const { argvJsonEnvKey } = engineIntegrationMeta(engineId);
  return parseArgsJson(readEnvRaw(argvJsonEnvKey), engineId) ?? [];
}
