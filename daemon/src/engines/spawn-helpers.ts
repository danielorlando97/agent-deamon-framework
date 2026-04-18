import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

import { getEngineRawStreamLogDir } from "./engine-env.js";
import { createLogger } from "../logger.js";

const log = createLogger("spawn-helpers");

export function killProcessTree(child: ChildProcess): void {
  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  setTimeout(() => {
    try {
      if (child.exitCode === null) child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }, 1500).unref?.();
}

export type LineProcessResult = {
  exitCode: number | null;
  timedOut: boolean;
  killedBySignal: boolean;
};

/**
 * Spawn a process, stream stdout by line, stderr by chunk, optional stdin
 * string (then closed). Honors timeout and AbortSignal.
 */
export async function runLineProcess(opts: {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** If set, written to stdin then closed. If unset, stdin is ignored. */
  stdinContent?: string;
  /** When `AGENT_DAEMON_ENGINE_RAW_STREAM_LOG` is set, log stdout lines here. */
  engineId?: string;
  timeoutMs: number;
  signal: AbortSignal;
  onStdoutLine: (line: string) => void | Promise<void>;
  onStderrChunk: (text: string) => void | Promise<void>;
}): Promise<LineProcessResult> {
  const useStdin = opts.stdinContent !== undefined;
  const child: ChildProcess = spawn(
    opts.command,
    opts.args,
    {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: useStdin ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
      shell: false,
    },
  );

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    killProcessTree(child);
  }, opts.timeoutMs);

  const onAbort = () => {
    killProcessTree(child);
  };
  opts.signal.addEventListener("abort", onAbort, { once: true });

  if (useStdin && child.stdin) {
    child.stdin.write(opts.stdinContent ?? "", "utf8");
    child.stdin.end();
  }

  if (!child.stdout) {
    throw new Error("spawn: stdout pipe missing");
  }
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let stdoutChain: Promise<void> = Promise.resolve();
  let rawStreamLogPath: string | undefined;
  const appendRawStdoutBeforeParse = async (line: string): Promise<void> => {
    const { engineId } = opts;
    if (!engineId) return;
    const dir = getEngineRawStreamLogDir();
    if (!dir) return;
    if (!rawStreamLogPath) {
      await mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      rawStreamLogPath = join(
        dir,
        `${engineId}-${stamp}-${randomUUID().slice(0, 8)}.ndjson`,
      );
      log.debug("raw engine stdout log", { path: rawStreamLogPath, engineId });
    }
    await appendFile(rawStreamLogPath, `${line}\n`, "utf8");
  };
  rl.on("line", (line) => {
    stdoutChain = stdoutChain.then(async () => {
      await appendRawStdoutBeforeParse(line);
      await Promise.resolve(opts.onStdoutLine(line));
    });
  });

  if (child.stderr) {
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      void Promise.resolve(opts.onStderrChunk(chunk));
    });
  }

  const exitCode: number | null = await new Promise((resolve) => {
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code));
  });

  clearTimeout(timer);
  opts.signal.removeEventListener("abort", onAbort);
  rl.close();
  await stdoutChain;

  return {
    exitCode,
    timedOut,
    killedBySignal: opts.signal.aborted && !timedOut,
  };
}

/**
 * Run a command to completion, buffering stdout/stderr (for short CLI probes).
 */
export async function runCaptureOutput(opts: {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
}): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}> {
  const useStdin = opts.stdin !== undefined;
  const child: ChildProcess = spawn(opts.command, opts.args, {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    stdio: useStdin ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    shell: false,
  });

  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timedOut = true;
    killProcessTree(child);
  }, opts.timeoutMs);

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const append = (
    buf: Buffer,
    cur: { s: string; done: boolean },
    max: number,
  ): void => {
    if (cur.done) return;
    const nextLen = cur.s.length + buf.length;
    if (nextLen > max) {
      cur.s += buf.subarray(0, Math.max(0, max - cur.s.length)).toString("utf8");
      cur.done = true;
      clearTimer();
      killProcessTree(child);
      return;
    }
    cur.s += buf.toString("utf8");
  };

  const outState = { s: "", done: false };
  const errState = { s: "", done: false };

  if (child.stdout) {
    child.stdout.on("data", (b: Buffer) => {
      append(b, outState, opts.maxStdoutBytes);
    });
  }
  if (child.stderr) {
    child.stderr.on("data", (b: Buffer) => {
      append(b, errState, opts.maxStderrBytes);
    });
  }

  if (useStdin && child.stdin) {
    child.stdin.write(opts.stdin ?? "", "utf8");
    child.stdin.end();
  }

  const exitCode: number | null = await new Promise((resolve) => {
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code));
  });

  clearTimer();

  return {
    stdout: outState.s,
    stderr: errState.s,
    exitCode,
    timedOut,
  };
}
