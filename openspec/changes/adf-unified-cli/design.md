## Context

The repository contains **`daemon/`** (Hono + `@hono/node-server`, `tsx` dev)
and **`web/`** (Vite + React, strict port 5173, `/api` → `127.0.0.1:8787`).
Documentation references **`cli/`** and **`agent-daemon-tty`**, but that package
is not present in the tree yet; operators today would run separate `npm` paths
per folder. The user wants a single **`adf`** UX: `run daemon`, `run web`, and
`chat`.

## Goals / Non-Goals

**Goals:**

- One install at **`agent-deamon-framework/`** root that exposes **`adf`**.
- **`adf run daemon`** and **`adf run web`** as first-class commands (spawn the
  same stacks as today’s package scripts, from the correct working directories).
- **`adf chat`** as the console client path (HTTP to daemon), consistent with
  documented TTY behavior.
- Clear env parity with existing vars (`AGENT_DAEMON_PORT`, `AGENT_DAEMON_HOST`,
  `AGENT_DAEMON_CWD`, etc.).

**Non-Goals:**

- Changing daemon HTTP API or web UI behavior beyond what is needed to launch
  processes.
- Production bundling of web assets inside `adf` (still dev-server oriented for
  `run web` unless explicitly extended later).
- Windows-specific service installation or global OS packages (document Node
  20+ only).

## Decisions

1. **npm workspaces at repo root**  
   Add `package.json` at `agent-deamon-framework/` with `"workspaces": ["daemon", "web", "cli"]` so `npm install` links local packages and a single `npx adf`
   resolves the CLI binary.

2. **Dedicated `cli/` workspace**  
   Implement `adf` in `cli/` (TypeScript, `"type": "module"`). Declare `"bin": { "adf": "./dist/cli.js" }` (or equivalent entry) built with `tsc` to avoid requiring `tsx` for end users who run `npx adf` after `npm run build -w cli`.

3. **Process spawning for `run`**  
   Use `child_process.spawn` with `stdio: "inherit"`, forwarding signals where
   practical. Resolve workspace roots via `fileURLToPath` + known relative layout
   from `cli` package location so `adf` works regardless of `process.cwd()`.

   - **`adf run daemon`**: run the same command as `daemon`’s dev script for MVP
     (`tsx watch src/index.ts`) or `node dist/index.js` if `ADF_DAEMON_MODE=prod`-style flag is added later; default = dev parity with README `npm run dev` for
     daemon-only half.

   - **`adf run web`**: run `vite` (or `npm run dev -w web`) from `web/`; user
     runs daemon separately unless we add a composite command in a future change.

4. **`chat` implementation**  
   Either (a) implement minimal readline + `fetch` SSE client inside `cli/`
   matching INTEGRATION.md contract, or (b) if `agent-daemon-tty` source is
   vendored later, wrap it behind `adf chat`. For this change, prefer **single
   codebase** in `cli/` to avoid orphan binary names.

5. **Backward compatibility**  
   Optionally register **`agent-daemon-tty`** as an alias bin pointing to the
   same entry with argv rewrite, or document deprecation one release; pick one
   in implementation to avoid breaking existing docs copies.

6. **Vite proxy vs. port**  
   Keep Vite default proxy target as today; document that changing
   `AGENT_DAEMON_PORT` requires matching Vite env (e.g. future `web` vite config
   reading env) — add a small task if we wire `VITE_*` or shared config.

## Risks / Trade-offs

- **[Risk] `tsx` not on PATH for `adf run daemon` if only production deps** →
  **Mitigation**: document dev dependency path; or spawn `npm run dev -w daemon`
  from root so npm’s local `tsx` is used.
- **[Risk] `cwd` surprises for engine subprocesses** → **Mitigation**: respect
  `AGENT_DAEMON_CWD` in daemon config (already documented); CLI docs repeat this.
- **[Risk] Duplicate chat logic vs. missing `cli/`** → **Mitigation**: spec
  tests focus on CLI contract; keep chat HTTP client thin.

## Migration Plan

1. Land root workspaces + `cli/` + `adf` bin.
2. Update README and `docs/*.md` to show `adf` first; keep `npx agent-daemon-tty`
   only if alias remains.
3. Optional release note: “Prefer `adf`; legacy command removed” if alias is
   dropped.

## Open Questions

- Whether **`npm run dev`** at root should become `concurrently` for daemon+web
  or stay as two terminals (user explicitly asked for separate `run` commands).
- Exact **`adf --help`** grouping (`run` as a subcommand group vs. top-level
  `adf daemon`); proposal uses `run daemon` / `run web` as user requested.
