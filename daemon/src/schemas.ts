import { z } from "zod";

/**
 * Centralized knobs for subprocess engines (HTTP `POST /api/chat` body).
 * Unknown keys at the top level are rejected; extend this schema only.
 */
export const engineOptionsSchema = z
  .object({
    model: z.string().min(1).max(512).optional(),
    /** Resolved under `AGENT_DAEMON_CWD` when relative; must stay under cwd. */
    cwd: z.string().min(1).max(4096).optional(),
    /** Extra directories passed to CLIs that support `--add-dir` (e.g. Claude). */
    addDirs: z.array(z.string().min(1).max(4096)).max(24).optional(),
    permissionMode: z
      .enum([
        "acceptEdits",
        "auto",
        "bypassPermissions",
        "default",
        "dontAsk",
        "plan",
      ])
      .optional(),
    approvalMode: z
      .enum(["plan", "default", "auto-edit", "yolo"])
      .optional(),
    executionMode: z.enum(["plan", "ask"]).optional(),
    resume: z.union([z.boolean(), z.string().min(1).max(512)]).optional(),
    sessionId: z.string().min(1).max(256).optional(),
    thinking: z
      .enum(["off", "minimal", "low", "medium", "high", "xhigh"])
      .optional(),
    variant: z.string().min(1).max(128).optional(),
    streamPartialOutput: z.boolean().optional(),
    continueSession: z.boolean().optional(),
    forkSession: z.boolean().optional(),
  })
  .strict();

export type EngineRunOptions = z.infer<typeof engineOptionsSchema>;

export const chatBodySchema = z
  .object({
    engineId: z.string().min(1).max(64),
    message: z.string().min(1).max(200_000),
    engineOptions: engineOptionsSchema.optional(),
    /** @deprecated Prefer `engineOptions.model`. */
    model: z.string().min(1).max(512).optional(),
  })
  .strict();

export type ChatBody = z.infer<typeof chatBodySchema>;

/**
 * Merges legacy top-level `model` into `engineOptions` for adapters.
 * `body` is already validated by `chatBodySchema`, so no second Zod pass.
 */
export function mergeEngineOptions(body: ChatBody): EngineRunOptions | undefined {
  const merged: EngineRunOptions = {
    ...(body.engineOptions ?? {}),
  };
  if (body.model !== undefined && merged.model === undefined) {
    merged.model = body.model;
  }
  const hasAny = (Object.values(merged) as unknown[]).some(
    (v) => v !== undefined,
  );
  return hasAny ? merged : undefined;
}
