import type { EmitFn } from "../../types.js";

/**
 * After `runLineProcess` returns: map exit/timeout/abort to SSE terminal
 * events (`error` or `done`).
 */
export async function finishCliRun(
  emit: EmitFn,
  signal: AbortSignal,
  res: { exitCode: number | null; timedOut: boolean },
  stderrBuf: string,
): Promise<void> {
  if (signal.aborted) {
    await emit({ type: "error", message: "Aborted" });
    return;
  }
  if (res.timedOut) {
    await emit({ type: "error", message: "Engine timed out" });
    return;
  }
  if (res.exitCode !== 0 && res.exitCode !== null) {
    const tail = stderrBuf.slice(-2000).trim() || `exit ${res.exitCode}`;
    await emit({ type: "error", message: tail });
    return;
  }
  await emit({ type: "done" });
}
