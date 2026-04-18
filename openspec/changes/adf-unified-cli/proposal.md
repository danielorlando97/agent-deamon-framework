## Why

The framework ships a TypeScript daemon, a Vite web app, and (per docs) a
separate TTY CLI, but there is no single, memorable entry point to run each
surface or open chat. A unified **`adf`** CLI closes the loop for operators and
docs: one binary, predictable subcommands, and a clear path to “run daemon”,
“run web”, or “chat” without juggling multiple `npm`/`npx` incantations.

## What Changes

- Add a top-level **`adf`** CLI (package/binary name to be aligned in design)
  with subcommands:
  - **`adf run daemon`** — start the HTTP daemon (foreground or documented
    default), same behavior as today’s daemon dev/start path.
  - **`adf run web`** — start the Vite dev server for the chat UI, with `/api`
    proxying to the daemon URL (env-configurable).
  - **`adf chat`** — TTY chat against the daemon (equivalent to documented
    `agent-daemon-tty chat` / auto-spawn flows where applicable).
- Wire **`npm install`** at repo root (or documented workspace) so `adf` is
  available via `npx adf` or `node_modules/.bin/adf` after install.
- Update user-facing docs (README, USER_GUIDE, INTEGRATION) to prefer **`adf`**
  as the primary interface, keeping legacy commands as aliases or footnotes
  where useful.
- **BREAKING** (only if we remove old binaries without aliases): any removal of
  `agent-daemon-tty` or root scripts without a transition path should be
  called out in implementation; this proposal assumes either rename with
  deprecation or dual-publish for one release.

## Capabilities

### New Capabilities

- `adf-cli`: Unified command-line interface for running the daemon, the web
  dev server, and console chat against the daemon, including env defaults and
  documented parity with existing npm scripts.

### Modified Capabilities

- _(none — no baseline `openspec/specs/` in this tree; prior MVP specs live
  under another change and are not amended here.)_

## Impact

- New or refactored **`cli/`** package (or root workspace package) in
  `agent-deamon-framework`, with `bin` entry for `adf`.
- **`package.json`** at framework root: workspaces, scripts, and dependency on
  `daemon`/`web`/`cli` as needed.
- **Documentation** in `docs/` and root `README.md`.
- **Developer workflow**: local install and CI may need to invoke `adf` or
  keep `npm run dev` as a thin wrapper over `adf` for backwards compatibility.
