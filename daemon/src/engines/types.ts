import type { EngineRunOptions } from "../schemas.js";

export type { EngineRunOptions };

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "thinking_done" }
  | {
      type: "tool";
      phase: "start" | "end";
      name: string;
      detail?: string;
      ok?: boolean;
    }
  | { type: "log"; stream: "stdout" | "stderr"; message: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type EmitFn = (ev: StreamEvent) => void | Promise<void>;

export type EngineIntegrationInfo = {
  argvJsonEnvKey: string;
  engineIdEnvSuffix: string;
};

export type EngineInfo = {
  id: string;
  label: string;
  description: string;
  available: boolean;
  integration?: EngineIntegrationInfo;
};

export type EngineRunContext = {
  message: string;
  cwd: string;
  timeoutMs: number;
  signal: AbortSignal;
  emit: EmitFn;
  /** HTTP `engineOptions` — single vocabulary for model, modes, session, dirs. */
  options?: EngineRunOptions;
};

export type EngineDefinition = {
  info: EngineInfo;
  run: (ctx: EngineRunContext) => Promise<void>;
};
