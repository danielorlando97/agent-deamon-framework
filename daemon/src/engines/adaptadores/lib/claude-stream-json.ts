import type { EmitFn } from "../../types.js";
import { asStr, safeJsonParse } from "./json.js";

/** One JSON object per line on stdin for `claude -p --input-format stream-json`. */
export function buildClaudeStdin(prompt: string): string {
  const payload = {
    type: "user",
    message: {
      role: "user",
      content: [{ type: "text", text: prompt }],
    },
  };
  return `${JSON.stringify(payload)}\n`;
}

function summarizeToolInput(input: unknown): string {
  if (input === undefined) return "";
  if (typeof input === "string") return input.slice(0, 600);
  try {
    return JSON.stringify(input).slice(0, 600);
  } catch {
    return "";
  }
}

async function emitAssistantBlocks(
  msg: Record<string, unknown> | undefined,
  emit: EmitFn,
): Promise<void> {
  const content = Array.isArray(msg?.content) ? msg.content : [];
  for (const blockRaw of content) {
    const block = blockRaw as Record<string, unknown>;
    const t = asStr(block.type);
    if (t === "text" && asStr(block.text)) {
      await emit({ type: "delta", text: asStr(block.text) });
      continue;
    }
    if (t === "thinking") {
      const think =
        asStr(block.thinking) || asStr(block.text);
      if (think) await emit({ type: "thinking_delta", text: think });
      continue;
    }
    if (t === "tool_use") {
      const name = asStr(block.name) || "tool";
      await emit({
        type: "tool",
        phase: "start",
        name,
        detail: summarizeToolInput(block.input),
      });
    }
  }
}

async function emitUserToolResults(
  msg: Record<string, unknown> | undefined,
  emit: EmitFn,
): Promise<void> {
  const content = Array.isArray(msg?.content) ? msg.content : [];
  for (const blockRaw of content) {
    const block = blockRaw as Record<string, unknown>;
    if (asStr(block.type) !== "tool_result") continue;
    const err = block.is_error === true;
    let detail = "";
    const c = block.content;
    if (typeof c === "string") detail = c.slice(0, 800);
    else detail = summarizeToolInput(c);
    await emit({
      type: "tool",
      phase: "end",
      name: "tool_result",
      detail,
      ok: !err,
    });
  }
}

/** Parses one stdout line of `claude --output-format stream-json`. */
export async function emitClaudeStreamJsonLine(
  line: string,
  emit: EmitFn,
): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;
  const o = safeJsonParse(trimmed);
  if (!o) return;
  const ty = asStr(o.type);
  if (ty === "user") {
    const msg = o.message as Record<string, unknown> | undefined;
    await emitUserToolResults(msg, emit);
    return;
  }
  if (ty !== "assistant") return;
  const msg = o.message as Record<string, unknown> | undefined;
  await emitAssistantBlocks(msg, emit);
}
