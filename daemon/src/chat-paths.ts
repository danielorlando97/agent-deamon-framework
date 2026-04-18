import path from "node:path";

import type { EngineRunOptions } from "./schemas.js";

/** Resolve a path relative to `base` when not absolute. */
export function resolveWorkspacePath(base: string, raw: string): string {
  const t = raw.trim();
  if (t.length === 0) return path.resolve(base);
  return path.isAbsolute(t) ? path.resolve(t) : path.resolve(base, t);
}

/** True when `abs` is `base` or a subdirectory (after normalization). */
export function isPathUnderBase(abs: string, base: string): boolean {
  const b = path.resolve(base);
  const a = path.resolve(abs);
  return a === b || a.startsWith(b + path.sep);
}

/** Reject cwd / addDirs that escape `AGENT_DAEMON_CWD`. */
export function validateEnginePaths(
  base: string,
  opts: EngineRunOptions | undefined,
): string | null {
  if (!opts) return null;
  if (opts.cwd) {
    const abs = resolveWorkspacePath(base, opts.cwd);
    if (!isPathUnderBase(abs, base)) {
      return "engineOptions.cwd must resolve under AGENT_DAEMON_CWD";
    }
  }
  for (const d of opts.addDirs ?? []) {
    const abs = resolveWorkspacePath(base, d);
    if (!isPathUnderBase(abs, base)) {
      return `engineOptions.addDirs must stay under AGENT_DAEMON_CWD: ${d}`;
    }
  }
  return null;
}
