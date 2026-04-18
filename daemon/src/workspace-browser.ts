import { readdir } from "node:fs/promises";
import path from "node:path";

import { isPathUnderBase, resolveWorkspacePath } from "./chat-paths.js";

export type WorkspaceListEntry = { name: string; type: "dir" };

/**
 * Normalize a workspace-relative path from the API (POSIX-style segments).
 * Rejects traversal outside the tree before resolve.
 */
export function normalizeWorkspaceRel(raw: string): string {
  const segments = raw
    .replace(/\\/g, "/")
    .split("/")
    .filter((s) => s.length > 0 && s !== ".");
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === "..") {
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.join("/");
}

export function parentWorkspaceRel(
  base: string,
  normalizedRel: string,
): string | null {
  const t = normalizedRel.trim();
  if (!t) return null;
  const currentAbs = resolveWorkspacePath(base, t);
  const parentAbs = path.dirname(currentAbs);
  const b = path.resolve(base);
  const pa = path.resolve(parentAbs);
  if (!isPathUnderBase(pa, b)) return null;
  if (pa === b) return "";
  const rel = path.relative(b, pa);
  if (rel.startsWith("..")) return null;
  return rel.split(path.sep).join("/");
}

export async function listWorkspaceDirs(
  base: string,
  rawRel: string,
): Promise<{
  rel: string;
  absolute: string;
  parentRel: string | null;
  entries: WorkspaceListEntry[];
}> {
  const normalized = normalizeWorkspaceRel(rawRel);
  const absolute = resolveWorkspacePath(base, normalized);
  if (!isPathUnderBase(absolute, path.resolve(base))) {
    throw new Error("path outside workspace");
  }
  const dirents = await readdir(absolute, { withFileTypes: true });
  const entries: WorkspaceListEntry[] = dirents
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, type: "dir" as const }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    rel: normalized,
    absolute,
    parentRel: parentWorkspaceRel(base, normalized),
    entries,
  };
}
