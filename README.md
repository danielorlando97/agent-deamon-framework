# Agent Daemon Framework

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

Local **HTTP daemon** that routes chat requests to pluggable **engines** (CLI
tools such as Claude Code, Codex, Cursor Agent, OpenCode, Pi, Qwen). A **React**
demo UI and a small **`adf` CLI** speak to the same API—nothing executes engine
binaries except the daemon.

**Documentation (Spanish):** full guides live under [`docs/`](docs/README.md)
(quick start, user guide, integration, architecture).

---

## Architecture: external intelligence for products above

ADF is meant to sit **below** your product: you treat it as an **external
provider of automated intelligence**—a stable **HTTP + SSE** boundary—while
**apps, extensions, scripts, or SaaS** stay **above** the API and never spawn
vendor CLIs directly.

```
 +-------------------------------------------------------------------+
 |  Your product · UI, backend, workflows, integrations, SaaS        |
 +-------------------------------------------------------------------+
                               |
                  HTTP / SSE (chat, engines, models)
                               v
 +-------------------------------------------------------------------+
 |  ADF daemon · adapters, SSE, cwd, timeouts, stream parsing        |
 +-------------------------------------------------------------------+
                               |
                  subprocess · env · vendor CLI flags
                               v
 +-------------------------------------------------------------------+
 |  Agent CLIs on PATH · Claude, Codex, Cursor Agent, OpenCode, …    |
 +-------------------------------------------------------------------+
```

The daemon **normalizes** different vendors into one stream shape; your layer
only needs **one client contract** ([`docs/INTEGRATION.md`](docs/INTEGRATION.md)).
That keeps **product code** focused on UX, permissions, and business rules,
while **execution and CLI quirks** stay isolated in ADF.

---

## Why this exists

Teams already use multiple vendor CLIs with different flags and streaming
formats. This project gives you:

- **One HTTP surface** (`POST /api/chat` with SSE) for tools and scripts.
- **Engine adapters** that normalize subprocess output into stream events.
- **A minimal web UI** to try engines side by side without writing clients.
- **A terminal chat** (`adf chat`) that uses the same API as the browser.

It does **not** replace vendor accounts, licensing, or authentication—you still
install and log in to each CLI yourself.

---

## Requirements

- **Node.js 20+**

Optional per engine: install the CLI you want on your `PATH` (`claude`, `codex`,
`agent`, `opencode`, `pi`, `qwen`, …). Availability is detected at runtime with
`command -v`.

---

## Quick start (from a clone)

```bash
git clone https://github.com/danielorlando97/agent-deamon-framework.git
cd agent-deamon-framework
npm install
```

Run **daemon** and **web** in two terminals (defaults: API `127.0.0.1:8787`, Vite
`127.0.0.1:5173`):

```bash
# Terminal 1
npx adf run daemon

# Terminal 2
npx adf run web
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173) (or `localhost`; set
`ADF_WEB_PORT` to change the dev port).

**Terminal-only chat:** with the daemon running:

```bash
npx adf chat
```

Stop whatever is listening on the configured daemon + web ports:

```bash
npx adf stop
```

Smoke check (needs `jq`; daemon must be up):

```bash
npm run smoke
```

More detail: **[docs/QUICKSTART.md](docs/QUICKSTART.md)** (Spanish),
**[docs/USER_GUIDE.md](docs/USER_GUIDE.md)**.

---

## Install the CLI on your system (`adf` on PATH)

The CLI must still find the **repository root** (folders `daemon/` and `web/`)
to run `adf run daemon` and `adf run web`. Resolution order:

1. **`ADF_FRAMEWORK_ROOT`** — absolute path to the clone root (works from any
   directory after a global install).
2. **Current working directory** — walks up until it finds `daemon/` + `web/`.
3. **CLI install location** — same walk from the installed package (covers
   `npx` / local `node_modules` without global install).

### Option A — global install from your clone (recommended)

From the repository root after `npm install`:

```bash
npm run install:cli
```

Equivalent:

```bash
bash scripts/install-cli.sh
```

This runs `npm install -g ./cli` after building. You may need to fix npm’s
global prefix permissions or use `sudo` on some Unix setups.

Remove the global package:

```bash
npm run unlink:cli
```

### Option B — npm link (development)

```bash
npm run build -w cli
cd cli && npm link
```

### Option C — published package (when available)

After the CLI is published to npm:

```bash
npm install -g @actualidad/adf-cli
```

You still need the **full monorepo** on disk for `run daemon` / `run web`, and
either run commands **inside the clone** or set **`ADF_FRAMEWORK_ROOT`** to that
path.

---

## CLI reference

| Command | Description |
|---------|-------------|
| `adf run daemon` | Start the Hono HTTP server (dev: `tsx watch`). |
| `adf run web` | Start the Vite + React UI. |
| `adf chat` | Interactive console chat (daemon must be reachable). |
| `adf stop` | SIGTERM/SIGKILL processes listening on daemon + web ports. |

Flags: `--url <base>`, `--engine <id>`, `--model <id>` (see
**[docs/INTEGRATION.md](docs/INTEGRATION.md)**).

Legacy binary name **`agent-daemon-tty`** points to the same executable.

---

## Environment variables (common)

| Variable | Role |
|----------|------|
| `ADF_FRAMEWORK_ROOT` | Path to repo root when using a global `adf` outside the clone. |
| `AGENT_DAEMON_HOST` / `AGENT_DAEMON_PORT` | Daemon bind address (default `127.0.0.1:8787`). |
| `AGENT_DAEMON_URL` | Base URL for `adf chat` (default from host + port). |
| `AGENT_DAEMON_CWD` | Working directory passed to engines. |
| `AGENT_DAEMON_TIMEOUT_MS` | Subprocess timeout (default 20 minutes). |
| `ADF_WEB_PORT` | Vite dev port (default `5173`). |

Per-engine CLI extras: **`AGENT_ENGINE_<SUFFIX>_ARGS_JSON`** — see
**[docs/INTEGRATION.md](docs/INTEGRATION.md)**.

---

## Engines

| `engineId` | Typical CLI |
|------------|-------------|
| `claude` | `claude` (stream-json) |
| `codex` | `codex exec --json` |
| `cursor_agent` | Cursor `agent` (stream-json) |
| `opencode` | `opencode run --format json` |
| `pi` | `pi -p --mode json` |
| `qwen` | `qwen` (`--output-format stream-json`) |

Use `GET /api/engines` or the UI / `/engines` in `adf chat` for live
availability.

---

## Security

Defaults bind to **loopback only**. Do not expose the daemon to untrusted
networks without authentication, TLS, and hardening.

---

## Repository layout

```
agent-deamon-framework/
├── daemon/     # Hono server, engines, SSE
├── web/        # Vite + React UI
├── cli/        # npm package: adf, agent-daemon-tty
├── docs/       # User & integration guides (Spanish)
├── scripts/    # smoke.sh, install-cli.sh
└── openspec/   # OpenSpec change proposals
```

Developer-oriented detail: **[docs/TECHNICAL.md](docs/TECHNICAL.md)**.

---

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)**.

---

## Security

See **[SECURITY.md](SECURITY.md)** for reporting vulnerabilities.

---

## License

[MIT](LICENSE).

---

## Publishing note (maintainers)

Repository: **[github.com/danielorlando97/agent-deamon-framework](https://github.com/danielorlando97/agent-deamon-framework)**.

To publish the CLI package to npm separately: `npm run build -w cli`, then
`npm publish` from `cli/` (adjust package scope/name on npm if needed).
