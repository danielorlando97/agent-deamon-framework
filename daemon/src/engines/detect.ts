import { spawnSync } from "node:child_process";

/** Safe command names only (no shell metacharacters). */
export function commandOnPath(cmd: string): boolean {
  if (!/^[a-zA-Z0-9._-]+$/.test(cmd)) {
    return false;
  }
  const r = spawnSync("sh", ["-lc", `command -v ${cmd}`], {
    encoding: "utf8",
  });
  return r.status === 0;
}
