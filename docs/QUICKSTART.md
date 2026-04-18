# Quick start (5 minutes)

Minimal guide to get **daemon + web** or **terminal-only chat** running with the
`agent-deamon-framework` monorepo.

**Requirement:** Node.js **20+**.

---

## 1. Install

```bash
cd agent-deamon-framework
npm install
```

After this, the **`adf`** command is in `node_modules/.bin/` (use `npx adf`
from the repo root, or `./node_modules/.bin/adf`).

### 1.1 Install `adf` on your system (optional)

To have **`adf` on your PATH** from this repository (after `npm install`):

```bash
npm run install:cli
```

or:

```bash
bash scripts/install-cli.sh
```

This builds `cli/` and runs **`npm install -g ./cli`**. With a global install,
the CLI still needs to locate the monorepo for `adf run daemon` and `adf run
web`: run commands **inside the clone**, or set **`ADF_FRAMEWORK_ROOT`** to the
absolute path of the repo root.

Remove the global package:

```bash
npm run unlink:cli
```

For extra CLI flags (`--model`, etc.) without rebuilding, see section **10.1**
in [INTEGRATION.md](INTEGRATION.md) (`AGENT_ENGINE_*_ARGS_JSON`).

---

## 2. Option A — Web UI (recommended)

Open **two** terminals at the repo root:

| Terminal | Command |
|----------|---------|
| 1 | `adf run daemon` |
| 2 | `adf run web` |

Then open **http://localhost:5173** in your browser by default (Vite; port via
`ADF_WEB_PORT`). The web app proxies `/api` to the daemon using
`AGENT_DAEMON_HOST` and `AGENT_DAEMON_PORT` (default `127.0.0.1:8787`).

To stop:

- **From another terminal** (same port env vars as when you started):
  `adf stop` — signals whatever is listening on the daemon port and the web port
  (any process on those ports, not only this repo).
- Or **`Ctrl+C`** in each terminal where `run daemon` / `run web` is running.

---

## 3. Option B — Terminal only (CLI)

1. Start the daemon (one terminal): `adf run daemon`
2. In another terminal: `adf chat`

Useful commands inside chat: `/help`, `/engines`, `/engine <id>`, `/quit`.

Legacy shortcut (starts the daemon in the background if needed, then opens
chat): `npx agent-daemon-tty`

---

## 4. Engines (`engineId`)

Each chat request uses an **`engineId`**. All engines depend on a binary on
`PATH`; they only show as available if `command -v` finds them. Canonical list
(daemon registry order):

| `id` | Short description |
|------|-------------------|
| `claude` | `claude` CLI (stream-json output). |
| `codex` | `codex exec --json` (stdin). |
| `cursor_agent` | Cursor `agent` CLI (stream-json). |
| `opencode` | `opencode run --format json`. |
| `pi` | `pi -p --mode json`. |
| `qwen` | `qwen` with `--output-format stream-json`. |

At runtime: `GET /api/engines` or the list in the CLI/web and `/engines`.

---

## 5. Verify it responds (optional)

With the daemon running:

```bash
npm run smoke
```

(or `curl http://127.0.0.1:8787/api/health` if you use the default port).

---

## 6. Change port (example)

Use the **same** values for daemon, Vite proxy, and client:

```bash
export AGENT_DAEMON_PORT=8877
export AGENT_DAEMON_URL=http://127.0.0.1:8877
export ADF_WEB_PORT=5174
adf run daemon
# other terminal: same exports + adf run web
# other terminal: adf chat
# stop: same exports + adf stop
```

---

## Next steps

| You need… | Document |
|-----------|----------|
| More usage detail, engines, FAQ | [USER_GUIDE.md](USER_GUIDE.md) |
| HTTP/SSE API and integration | [INTEGRATION.md](INTEGRATION.md) |
| Repo architecture | [TECHNICAL.md](TECHNICAL.md) |
| Overview at repo root | [README.md](../README.md) |
