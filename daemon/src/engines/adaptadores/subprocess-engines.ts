/**
 * Aggregates subprocess-backed engines. Implementations live under
 * `engines/adaptadores/`; shared helpers in `engines/adaptadores/lib/`.
 */
import { createClaudeEngine } from "./claude.js";
import { createCodexEngine } from "./codex.js";
import { createCursorAgentEngine } from "./cursor-agent.js";
import { createOpencodeEngine } from "./opencode.js";
import { createPiEngine } from "./pi.js";
import { createQwenEngine } from "./qwen.js";
import type { EngineDefinition } from "../types.js";

export function subprocessEngines(timeoutMs: number): EngineDefinition[] {
  return [
    createClaudeEngine(timeoutMs),
    createCodexEngine(timeoutMs),
    createCursorAgentEngine(timeoutMs),
    createOpencodeEngine(timeoutMs),
    createPiEngine(timeoutMs),
    createQwenEngine(timeoutMs),
  ];
}
