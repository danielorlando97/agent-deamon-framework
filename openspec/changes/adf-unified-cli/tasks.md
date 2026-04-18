## 1. Workspace and package scaffold

- [x] 1.1 Add root `package.json` with npm workspaces for `daemon`, `web`, and
      `cli` (private root, scripts for `build` / `dev` helpers if needed).
- [x] 1.2 Create `cli/package.json` with name scoped for publish (e.g.
      `@actualidad/agent-daemon-framework-cli` or `adf-cli`), `"type":
      "module"`, `bin.adf`, `build` via `tsc`, and devDependency on
      `typescript` aligned with other packages.
- [x] 1.3 Add `cli/tsconfig.json` extending or mirroring Node 20 / ESM settings
      used in `daemon`.

## 2. adf command router

- [x] 2.1 Implement `cli/src/main.ts` (or `index.ts`) parsing argv: `run
      daemon`, `run web`, `chat`, global `--help` / unknown-command message per
      spec.
- [x] 2.2 Resolve framework paths from `import.meta.url` (locate `daemon/` and
      `web/` siblings) so commands work when cwd is not the repo root.

## 3. Run subcommands

- [x] 3.1 Implement `adf run daemon` by spawning the daemon dev stack (prefer
      `npm run dev --prefix <daemonDir>` or equivalent so local `tsx` is used).
- [x] 3.2 Implement `adf run web` by spawning the web dev server from `web/`
      with inherited stdio.
- [x] 3.3 Forward SIGINT/SIGTERM to child where reasonable and document
      behavior on child exit codes.

## 4. Chat subcommand

- [x] 4.1 Implement HTTP+SSE client for `POST /api/chat` matching daemon
      schemas (engine selection, streaming chunks to stdout/stderr as
      appropriate).
- [x] 4.2 Add interactive input loop (readline) with graceful shutdown and the
      unreachable-daemon error path from the spec.

## 5. Build, compatibility, and docs

- [x] 5.1 Ensure `npm install` at framework root links `adf`; add root script
      `npm run build` that builds `cli` (and optionally `daemon`/`web`).
- [x] 5.2 Optionally add `agent-daemon-tty` bin alias or document deprecation;
      align with proposal decision.
- [x] 5.3 Update `README.md`, `docs/USER_GUIDE.md`, `docs/INTEGRATION.md`, and
      `docs/README.md` to lead with `adf run daemon`, `adf run web`, `adf chat`.
- [x] 5.4 (Optional) If `AGENT_DAEMON_PORT` ≠ 8787, wire Vite proxy via env in
      `web/vite.config.ts` and document `VITE_*` or shared convention.

## 6. Verification

- [x] 6.1 Manual smoke: `adf run daemon` + curl health; `adf chat` with echo
      engine; `adf run web` loads UI.
- [x] 6.2 Update `scripts/smoke.sh` or add `cli` smoke notes if a non-interactive
      check is feasible.
