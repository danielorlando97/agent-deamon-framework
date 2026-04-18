# Technical documentation — Agent daemon framework

Maintenance-, extension-, and integration-focused view of the
`agent-deamon-framework` monorepo. Complements [INTEGRATION.md](INTEGRATION.md),
which focuses on the HTTP/SSE contract for external products.

---

## 1. MVP scope

| In scope | Out of scope (MVP) |
|----------|---------------------|
| Local HTTP daemon (Hono) | Authentication in the daemon |
| Engine catalog + execution + SSE | Server-side conversation persistence |
| Web demo (Vite + React) | Multi-tenant |
| CLI using `fetch` + optional global install from clone (`npm install -g ./cli`) | Stable version published on npm registry (optional future) |
| `command -v` detection for CLIs | Supported CLI version matrix |

---

## 2. Workspace layout (npm)

Root: `agent-deamon-framework/package.json`

```json
"workspaces": ["daemon", "web", "cli"]
```

| Package | Path | Role |
|---------|------|------|
| `daemon` | `daemon/` | Node server: `/api/*` routes, engine registry, SSE. |
| `web` | `web/` | React SPA: proxies `/api` → daemon in development. |
| `cli` | `cli/` | `adf` and `agent-daemon-tty` (alias) binaries: HTTP client; background spawn only in legacy `up` flow. |

Shared dependencies are **hoisted** to `node_modules/` at the monorepo root (e.g.
`tsx` for the CLI launcher and daemon in dev).

---

## 3. Logical diagram

```
                    ┌──────────────┐
                    │   browser    │
                    │   (web/)     │
                    └──────┬───────┘
                           │ HTTP same-origin
                           │  /api → proxy →
                           ▼
┌──────────────┐     HTTP      ┌─────────────────┐
│  adf /       │◄──────────────│  cli/ (adf)     │
│  agent-daemon│   localhost   │                 │
│  -tty        │               │                 │
└──────┬───────┘               └────────┬────────┘
       │                                │
       │  spawn (legacy `up` bin only)  │
       ▼                                │
┌──────────────────────────────────────┴───────┐
│              daemon/ (Hono)                 │
│  GET /api/engines  GET /api/engine-models  POST /api/chat (SSE)     │
└──────────────────────┬──────────────────────┘
                       │ EngineDefinition.run()
                       ▼
              ┌────────────────┐
              │  adaptadores/  │
              │  (CLI engines) │
              └────────────────┘
```

**Web** and **cli** do not import `daemon/src/*`; they only consume HTTP URLs.

---

## 4. `daemon/` package

### 4.1. Stack

- **Runtime:** Node 20+, ESM (`"type": "module"`).
- **HTTP framework:** [Hono](https://hono.dev/) + `@hono/node-server` (`serve`).
- **Validation:** Zod (`schemas.ts`).
- **Streaming:** `hono/streaming` → `streamSSE`, JSON events in `data` field.

### 4.2. Entry point

`daemon/src/index.ts`

- CORS applied to `/api/*` (fixed list of Vite origins).
- Routes: `GET /api/health`, `GET /api/engines`, `GET /api/engine-models`,
  `POST /api/chat`.

### 4.3. Configuration

`daemon/src/config.ts` reads:

- `AGENT_DAEMON_HOST` (default `127.0.0.1`)
- `AGENT_DAEMON_PORT` (default `8787`)
- `AGENT_DAEMON_TIMEOUT_MS` (default 20 min)
- `AGENT_DAEMON_CWD` (default `process.cwd()`)

### 4.4. Engines

| File | Contents |
|------|----------|
| `engines/types.ts` | `StreamEvent`, `EngineDefinition`, `EmitFn`. |
| `engines/registry.ts` | Assembles only `subprocessEngines()` from `adaptadores/`. |
| `engines/adaptadores/subprocess-engines.ts` | Adds the array: imports one `.ts` per CLI engine. |
| `engines/adaptadores/claude.ts`, `codex.ts`, `cursor-agent.ts`, `opencode.ts`, `pi.ts`, `qwen.ts` | One subprocess engine per file (CLI invocation comment at top). |
| `engines/adaptadores/lib/*.ts` | Shared helpers (JSON lines, process shutdown, Claude format). |
| `engines/spawn-helpers.ts` | `runLineProcess`: optional stdin, stdout lines, timeout, signals. |
| `engines/engine-env.ts` | `engineId` suffix → `AGENT_ENGINE_*_ARGS_JSON`, argv extra parsing/caps, `integration` metadata for HTTP listing. |
| `engines/list-models.ts` | `GET /api/engine-models`: polls CLIs (`agent`, `opencode`, `pi`) or static lists (`claude`, `codex`, `qwen`). |
| `engines/detect.ts` | `commandOnPath` via `sh -lc command -v`. |

**Internal contract:** `run(ctx)` receives `message`, `cwd`, `timeoutMs`,
`signal`, `emit` (async). It should end with a terminal event via `done` or
`error` in most happy paths; uncaught errors are wrapped by `index.ts`.

### 4.5. Adding a new engine (technical checklist)

1. Add `create…Engine(timeoutMs)` in a new file under `engines/adaptadores/`
   (or a demo there) and export it from `adaptadores/subprocess-engines.ts` if
   it is an external CLI.
2. Register in `engines/registry.ts` (`allEngines()`).
3. If it uses a subprocess, prefer `runLineProcess` and robust incremental
   parsing.
4. Add a row to README / USER_GUIDE if user-visible.
5. Test with `curl` + web demo + CLI.

---

## 5. `web/` package

- **Build tool:** Vite 6, React 19.
- **Proxy:** `vite.config.ts` → `/api` to `http://127.0.0.1:8787`.
- **Main UI:** `web/src/App.tsx` — local state, `fetch` + manual SSE body read
  (no `EventSource` because POST).

**Note:** design is demo-only; no router or global store.

---

## 6. `cli/` package

### 6.1. Binary startup

`cli/bin/adf.mjs` is the Node shebang that imports `cli/dist/cli.js` (`tsc`
output). npm-declared binaries are **`adf`** and **`agent-daemon-tty`** (same
file).

### 6.2. Modules

| File | Responsibility |
|------|----------------|
| `cli/src/cli.ts` | Arg parsing, `run daemon` / `run web` / `stop` / `chat`, SSE REPL, legacy `agent-daemon-tty` mode, monorepo detection and `spawn` of `npm run dev` in `daemon/` and `web/`. |

### 6.3. Monorepo resolution

`findFrameworkRoot()` needs the root containing **`daemon/package.json`** and
**`web/package.json`**. Order:

1. **`ADF_FRAMEWORK_ROOT`** (absolute path to clone) — useful with **`npm install -g`** outside the repo tree.
2. Walk up from **`process.cwd()`**.
3. Walk up from the **`cli.js`** install directory (`npx adf`, `node_modules/.bin`).

Scripts: **`npm run install:cli`**, **`scripts/install-cli.sh`**, **`npm link`**
in `cli/`. See [README.md](../README.md).

---

## 7. API contract (summary)

Full detail in [INTEGRATION.md — HTTP and SSE](INTEGRATION.md#6-http-contract-api-reference).

- `GET /api/health` → `{ ok: true }`
- `GET /api/engines` → `{ engines: EngineInfo[] }`
- `GET /api/engine-models` → `{ engines: EngineModelsPayload[] }` (models per
  engine: CLI or static list; see `engines/list-models.ts`).
- `POST /api/chat` → body `{ engineId, message, engineOptions?, model? }`
  (`engineOptions` strict; see `daemon/src/schemas.ts`), response
  `text/event-stream` with JSON per `data:` event.

---

## 8. Scripts and utilities

| Path | Use |
|------|-----|
| `scripts/smoke.sh` | `curl` health, engines, and one chat turn with first `available` engine (needs `jq`). |
| `adf run daemon` / `adf run web` | Dev startup from monorepo root. |
| `adf chat` | REPL against a running daemon. |

---

## 9. Quality and manual testing

No automated E2E suite in CI for this MVP. Typical checklist:

1. `npm install` at monorepo root.
2. `curl` health + engines + POST chat with an available engine.
3. `adf run daemon` + `adf run web` — web flow (list, send, streaming).
4. `adf chat` with daemon already up.
5. `AGENT_DAEMON_PORT=8877 npx agent-daemon-tty --url http://127.0.0.1:8877` —
   legacy `up` startup without conflicting with 8787.

---

## 10. Known limitations and technical debt

- **CORS** is fixed in code; integration from other origins needs a proxy or a
  change in `daemon/src/index.ts`.
- **CLI errors** are sometimes summarized as `exit 1` without forwarding vendor
  error JSON into the SSE event (possible parser improvement).
- **Pi / slow engines:** timeouts and cancel UX depend on the user (`Ctrl+C` /
  fetch abort).
- **Windows:** paths and subprocess signals are not the MVP focus (tested
  mainly on Unix).

---

## 11. Related documentation

- [Index `docs/README.md`](README.md)
- [User guide](USER_GUIDE.md)
- [Product integration](INTEGRATION.md)
- [Root README (quick start)](../README.md)
