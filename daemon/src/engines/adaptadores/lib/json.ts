/** Shared helpers for line-delimited JSON emitted by CLIs. */

export function safeJsonParse(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}
