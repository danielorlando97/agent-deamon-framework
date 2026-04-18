# Integrating the agent daemon into your products

Detailed, step-by-step guide for connecting applications (web, backend, desktop)
to the **HTTP daemon** of the `agent-deamon-framework` monorepo. Assumes the
daemon exposes the API documented here (routes under `/api`, streaming via SSE).

---

## Table of contents

1. [What the daemon is and what problem it solves](#1-what-the-daemon-is-and-what-problem-it-solves)
2. [Recommended architecture](#2-recommended-architecture)
3. [Prerequisites](#3-prerequisites)
4. [Step 1: Get and start the daemon](#4-step-1-get-and-start-the-daemon)
5. [Step 2: Check connectivity](#5-step-2-check-connectivity)
6. [HTTP contract: API reference](#6-http-contract-api-reference)
7. [SSE contract: streaming events](#7-sse-contract-streaming-events)
8. [Step 3: Integrate from a backend (Node, Python, Go, etc.)](#8-step-3-integrate-from-a-backend-node-python-go-etc)
9. [Step 4: Integrate from a web application (browser)](#9-step-4-integrate-from-a-web-application-browser)
10. [Engines (`engineId`) and availability](#10-engines-engineid-and-availability)  
    10.1. [Injecting extra CLI arguments](#101-injecting-extra-cli-arguments)
11. [Cancellation, timeouts, and lifecycle](#11-cancellation-timeouts-and-lifecycle)
12. [Errors and HTTP status codes](#12-errors-and-http-status-codes)
13. [Security and deployment](#13-security-and-deployment)
14. [Deployment patterns](#14-deployment-patterns)
15. [Extending CORS and advanced configuration](#15-extending-cors-and-advanced-configuration)
16. [Troubleshooting](#16-troubleshooting)
17. [Console CLI (adf and agent-daemon-tty)](#17-console-cli-adf-and-agent-daemon-tty)
18. [Appendix: minimal TypeScript client](#18-appendix-minimal-typescript-client)

---

## 1. What the daemon is and what problem it solves

The **daemon** is a Node.js process that:

- Exposes **HTTP** on a configurable host/port (default `127.0.0.1:8787`).
- Offers a catalog of **engines**: local demos and, if present on `PATH`, CLIs
  such as Claude Code, Codex, Cursor `agent`, OpenCode, Pi, Qwen.
- For each chat request it may **spawn subprocesses** or run internal logic and
  **relay** the result as **Server-Sent Events (SSE)** with normalized JSON
  events.

**Problem it solves:** your product (SaaS, IDE plugin, orchestrator) does not
have to implement each CLI’s protocol or manage signals, timeouts, and streams;
it speaks **only HTTP + JSON + SSE** to a process running **next to the user**
(same machine or trusted network).

---

## 2. Recommended architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Your product (cloud / SaaS)                                  │
│  — does not run user CLIs directly                            │
└──────────────────────────────┬──────────────────────────────┘
                               │  Optional: queue, auth, billing
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  User machine                                                 │
│  ┌──────────────┐      HTTP/SSE      ┌─────────────────────┐ │
│  │ Your local UI │ ◄──────────────► │  agent-daemon        │ │
│  │ or local agent│                    │  (this repo)         │ │
│  └──────────────┘                    └──────────┬──────────┘ │
│                                                 │ spawn       │
│                                                 ▼             │
│                                        claude / codex / …     │
└─────────────────────────────────────────────────────────────┘
```

**Practical rule:** the daemon should be reachable **only from where running
local code makes sense** (localhost or private network). Do not expose it to the
internet without authentication and TLS layers.

---

## 3. Prerequisites

| Requirement | Detail |
|-------------|--------|
| Node.js | **20+** recommended (aligned with the monorepo). |
| Network | Client must open **TCP** to `AGENT_DAEMON_HOST:AGENT_DAEMON_PORT`. |
| CLIs (optional) | For real engines, binaries must be on `PATH` and authenticated (API keys, OAuth, etc.) on the user machine. |
| CORS (browser only) | Daemon ships a fixed CORS origin list; for other origins use a **reverse proxy** or extend the list (see [§15](#15-extending-cors-and-advanced-configuration)). |

---

## 4. Step 1: Get and start the daemon

### 4.1. Location in the repository

Daemon code lives at:

`agent-deamon-framework/daemon/`

### 4.2. Install dependencies

From the `agent-deamon-framework` monorepo root:

```bash
cd agent-deamon-framework
npm install
```

### 4.3. Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AGENT_DAEMON_HOST` | No | `127.0.0.1` | Bind address. Keep loopback unless you know why to open wider. |
| `AGENT_DAEMON_PORT` | No | `8787` | HTTP port. |
| `AGENT_DAEMON_TIMEOUT_MS` | No | `1200000` (20 min) | Max time per chat turn (subprocesses). |
| `AGENT_DAEMON_CWD` | No | Daemon `process.cwd()` | Working directory for subprocesses (user repo). |

Example:

```bash
export AGENT_DAEMON_PORT=8787
export AGENT_DAEMON_CWD="$HOME/projects/my-repo"
```

### 4.4. Development startup

From monorepo root (recommended):

```bash
cd agent-deamon-framework
adf run daemon
```

Equivalent with npm in the workspace:

```bash
cd agent-deamon-framework
npm run dev -w daemon
```

Or daemon package only:

```bash
cd agent-deamon-framework/daemon
npm run dev
```

You should see log output like:

`agent-daemon listening on http://127.0.0.1:8787`

### 4.5. Production startup (reference)

After building (`npm run build -w daemon` if `tsc` emits `dist/`), run the entry
with Node. In this MVP the usual path is **tsx** or **node** on transpiled code;
adjust for your pipeline.

---

## 5. Step 2: Check connectivity

### 5.1. Health check

```bash
curl -sS "http://127.0.0.1:8787/api/health"
```

Expected response: `{"ok":true}`

### 5.2. Engine list

```bash
curl -sS "http://127.0.0.1:8787/api/engines" | jq .
```

Confirm JSON includes `engines[]` with `id`, `label`, `description`, and
`available`.

### 5.3. Test chat (SSE)

```bash
ENGINE="$(curl -sS "http://127.0.0.1:8787/api/engines" | jq -r '[.engines[] | select(.available==true)][0].id')"
curl -sS -N -X POST "http://127.0.0.1:8787/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"engineId\":\"${ENGINE}\",\"message\":\"hello\"}"
```

You should see `data: {...}` lines in SSE format (see [§7](#7-sse-contract-streaming-events)).

The `agent-deamon-framework/scripts/smoke.sh` script automates part of this.

---

## 6. HTTP contract: API reference

Base URL: `http://{AGENT_DAEMON_HOST}:{AGENT_DAEMON_PORT}`

All documented routes use the **`/api`** prefix.

### 6.1. `GET /api/health`

- **Purpose:** verify the process responds.
- **Body:** JSON `{ "ok": true }`
- **Status codes:** `200`

### 6.2. `GET /api/engines`

- **Purpose:** engine catalog for selectors or routing policies.
- **Body:** JSON

```json
{
  "engines": [
    {
      "id": "claude",
      "label": "Claude Code",
      "description": "Local `claude` CLI (stream-json).",
      "available": false,
      "integration": {
        "argvJsonEnvKey": "AGENT_ENGINE_CLAUDE_ARGS_JSON",
        "engineIdEnvSuffix": "CLAUDE"
      }
    }
  ]
}
```

Each engine includes `integration` with `argvJsonEnvKey` and encoded suffix
(`engineIdEnvSuffix`); see [§10.1](#101-injecting-extra-cli-arguments).

- **Status codes:** `200`

### 6.2.1. `GET /api/engine-models`

- **Purpose:** catalog of **suggested models** per engine (output from CLIs such
  as `agent --list-models`, `opencode models`, `pi --list-models`, or static
  lists when no command exists).
- **Body:** JSON `{ "engines": [ { "engineId", "available", "source",
  "models": [{ "id", "label?" }], "error?", "note?" } ] }`.
- **Status codes:** `200`  
  Polling may take up to `AGENT_DAEMON_LIST_MODELS_TIMEOUT_MS` (default 45s)
  per process.

### 6.3. `POST /api/chat`

- **Purpose:** one conversation turn: one user message → event stream until
  completion.
- **Headers:** `Content-Type: application/json`
- **Body (JSON):**

| Field | Type | Constraints |
|-------|------|-------------|
| `engineId` | string | `1…64` chars, must exist in catalog. |
| `message` | string | `1…200000` chars. |
| `engineOptions` | object (opt.) | **Unique**, **strict** vocabulary (no unknown keys) for subprocess. |
| `model` | string (opt., legacy) | Same as `engineOptions.model` when that is omitted. |

Allowed fields in **`engineOptions`** (all optional):

| Field | Typical use |
|-------|-------------|
| `model` | `--model` / equivalent for the engine. |
| `cwd` | Subprocess working dir; must stay **under** `AGENT_DAEMON_CWD`. |
| `addDirs` | Extra paths; Claude → `--add-dir` (each under daemon cwd). |
| `permissionMode` | Claude → `--permission-mode` (`acceptEdits`, `auto`, `bypassPermissions`, …). |
| `approvalMode` | Qwen → `--approval-mode` (`plan`, `default`, `auto-edit`, `yolo`). |
| `executionMode` | Cursor `agent` → `--mode` (`plan`, `ask`). |
| `resume` | `boolean` or `string` (engine: `--resume` / `-r` / `--continue` per adapter). |
| `sessionId` | Session id (e.g. Claude `--session-id`, OpenCode `-s`). |
| `thinking` | Pi → `--thinking` (`off` … `xhigh`). |
| `variant` | OpenCode → `--variant`. |
| `streamPartialOutput` | Cursor: `false` omits `--stream-partial-output`. |
| `continueSession` | Continue session (`-c` / `--continue` per engine). |
| `forkSession` | Claude → `--fork-session`. |

- **Success response:** `200` with **`text/event-stream`** (SSE) body.
- **Errors (JSON, not SSE):**

| Code | When |
|------|------|
| `400` | Invalid JSON, failed Zod validation, or engine **exists** but `available: false`. |
| `404` | Unknown `engineId`. |

Example error body:

```json
{ "error": "Unknown engine: foo" }
```

or, with validation:

```json
{ "error": { "fieldErrors": { … }, "formErrors": [] } }
```

---

## 7. SSE contract: streaming events

Each SSE event carries in `data` a **single JSON object** (one line), with no
extra fields outside JSON.

### 7.1. Event types

| `type` | Fields | Meaning |
|--------|--------|---------|
| `delta` | `text: string` | Assistant output fragment (append on client). |
| `log` | `stream: "stdout" \| "stderr"`, `message: string` | Debug traces or subprocess stderr. |
| `error` | `message: string` | Recoverable or business failure; client should display and **treat turn as ended** unless `done` also arrives (see note). |
| `done` | — | Turn completed successfully relative to the engine (no uncaught exception). |

**Termination note:** fatal engine errors may emit `error` without `done`. Your
client should treat **`error` as terminal** and optionally wait for stream close.
When the engine succeeds, `done` usually arrives.

### 7.2. Raw SSE format

Example (simplified):

```
data: {"type":"delta","text":"Hello"}

data: {"type":"done"}

```

Blocks are separated by **double newline** (`\n\n`). Parse lines starting with
`data: `.

---

## 8. Step 3: Integrate from a backend (Node, Python, Go, etc.)

### 8.1. Recommended flow

1. **Discovery:** `GET /api/engines` at session start or workspace setup.
2. **Selection:** persist chosen `engineId` (preferably only if
   `available === true`).
3. **Execution:** `POST /api/chat` with `fetch`, `httpx`, `http.Client`, etc.
4. **Consumption:** read body as byte stream, accumulate buffer, split on
   `\n\n`, parse JSON after `data: `.

### 8.2. Node.js (fetch + ReadableStream)

```javascript
const res = await fetch("http://127.0.0.1:8787/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ engineId: "claude", message: "hello" }),
});

if (!res.ok) {
  const err = await res.json();
  throw new Error(JSON.stringify(err));
}

const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = "";
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  // Extract SSE blocks from `buf` (see appendix §18).
}
```

### 8.3. Python (requests with stream)

Use `stream=True` and read line by line; detect `data: ` and `json.loads`.

### 8.4. Go

Use `http.Post` with `Body` as `io.Reader`; read with a scanner or buffer and
apply the same SSE parser.

### 8.5. Connecting from your “cloud”

If your cloud backend must orchestrate the user, do **not** call `127.0.0.1` on
the cloud server: the user’s daemon is not there. You need one of:

- **Local agent** your app installs that registers with your API via tunnel or
  websocket (out of scope for this MVP).
- **VPN / private network** where the user’s daemon has a reachable IP for your
  trusted component.

---

## 9. Step 4: Integrate from a web application (browser)

### 9.1. Same machine, same origin (recommended)

Avoid CORS by serving your SPA and proxying `/api` to the daemon. Example
included in Vite (`web/vite.config.ts`):

```ts
proxy: { "/api": { target: "http://127.0.0.1:8787", changeOrigin: true } }
```

In the browser use relative routes:

```ts
await fetch("/api/engines");
await fetch("/api/chat", { method: "POST", … });
```

### 9.2. Different origin (other port or domain)

The daemon currently allows explicit CORS for `localhost:5173` and
`127.0.0.1:5173`. Options:

1. **Proxy** on your dev server or gateway (preferred).
2. **Extend** the list in `daemon/src/index.ts` (`cors({ origin: [...] })`).

### 9.3. AbortController

Pass `signal` to `fetch` to cancel when the user hits “Stop”; the daemon aborts
work tied to the request when the runtime propagates to the engine.

---

## 10. Engines (`engineId`) and availability

| `id` | Typical behavior |
|------|------------------|
| `claude`, `codex`, `cursor_agent`, `opencode`, `pi`, `qwen` | Subprocess if binary exists on `PATH`. |

**Robust integration:**

1. Do not hardcode “Claude always available”; use `GET /api/engines`.
2. Disable UI when `available === false`.
3. Handle `400` for unavailable engine if catalog changes between `GET` and
   `POST`.

### 10.1. Injecting extra CLI arguments

Use env var pattern **`AGENT_ENGINE_*_ARGS_JSON`** to append **command-line
arguments** (flags
such as `--model`, `--foo`, bare values expected after a flag, etc.) to a given
engine’s subprocess:

| Piece | Meaning |
|-------|---------|
| `<ENGINEID>` suffix | Engine `id` in **uppercase**; non-alphanumeric → `_` (e.g. `cursor_agent` → `CURSOR_AGENT`). |
| `AGENT_ENGINE_<SUFFIX>_ARGS_JSON` | JSON **array of strings** merged into CLI `argv` in the order documented per adapter (`daemon/src/engines/adaptadores/*.ts`). |

**Precedence:** adapter builds default `argv` first, then inserts `ARGS_JSON`
tokens at the documented position (before prompt in argv, before `-` on stdin,
etc.). The child **still inherits** the daemon `process.env`; there is no
`*_ENV_JSON` or extra env merge from this feature.

**Limits and errors:** JSON size, token count, and per-token length are capped in
`daemon/src/engines/engine-env.ts` (`ENGINE_ARGV_LIMITS`). Invalid JSON, not a
string array, or newline in a token: **extras ignored** (daemon console
warning), default argv only.

**HTTP discovery:** `GET /api/engines` returns `integration.argvJsonEnvKey` and
`integration.engineIdEnvSuffix`. Per-CLI vocabulary remains in adapter comments /
binary `--help`.

---

## 11. Cancellation, timeouts, and lifecycle

| Topic | Behavior |
|-------|----------|
| **Timeout** | `AGENT_DAEMON_TIMEOUT_MS` per turn. |
| **HTTP cancel** | Aborting `fetch` ends the request; engine gets `AbortSignal`. |
| **Subprocesses** | SIGTERM then SIGKILL on timeout (see `spawn-helpers`). |

Your product should:

- Show progress while the stream is open.
- Release UI when the stream closes or on `error` / `done`.

---

## 12. Errors and HTTP status codes

| Situation | HTTP | Body |
|-----------|------|------|
| Unknown engine | `404` | `{ "error": "Unknown engine: …" }` |
| Engine marked unavailable | `400` | `{ "error": "Engine unavailable: …" }` |
| Invalid JSON | `400` | `{ "error": "Invalid JSON body" }` |
| Validation | `400` | `{ "error": <Zod flatten> }` |
| Error during SSE | `200` | SSE event `type: "error"` |

Distinguish **transport errors** (network) from **application errors** (JSON 4xx
vs SSE `error`).

---

## 13. Security and deployment

1. **Bind:** default `127.0.0.1` — limits access to local processes.
2. **No auth in MVP:** any local process reaching the port can invoke chat. For
   products, add:
   - shared token in header (validate in Hono middleware),
   - or Unix socket + permissions,
   - or mTLS.
3. **Do not run the daemon as root** unless unavoidable.
4. **`message` content** may inject into the CLI; treat the daemon as a
   **privileged layer** running code on the user machine and validate policies in
   your product before sending.

---

## 14. Deployment patterns

| Pattern | Description |
|---------|-------------|
| **Local sidecar** | Desktop app or script starts daemon next to UI. |
| **User service** | Installer registers `launchd` / systemd user unit at login. |
| **Dev only** | Vite + proxy, as in `web/`. |
| **Container** | Mount `AGENT_DAEMON_CWD` as user repo volume; expose loopback only to host. |

---

## 15. Extending CORS and advanced configuration

CORS list is currently in `daemon/src/index.ts`:

```ts
cors({
  origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
})
```

For a new origin:

1. Add the exact URL (scheme + host + port).
2. Or replace with a function reading `process.env.AGENT_DAEMON_CORS_ORIGINS`
   (recommended future improvement).

---

## 16. Troubleshooting

| Symptom | What to check |
|---------|---------------|
| `ECONNREFUSED` | Daemon running? Correct port? |
| Browser CORS | Same-origin proxy or extend CORS ([§15](#15-extending-cors-and-advanced-configuration)). |
| `404` on chat | Typo in `engineId`; refresh catalog with `GET /api/engines`. |
| `400` Engine unavailable | Binary not on `PATH` or engine disabled. |
| Only `error` with `exit 1` | Check CLI stderr (quotas, auth); SSE parser does not replace vendor login. |
| Very slow chat | High timeout; check network or CLI model. |

---

## 17. Console CLI (adf and agent-daemon-tty)

Monorepo **`cli/`** package: **HTTP-only** client (same API as web). It does not
import engines or daemon internals. Main binary **`adf`**; **`agent-daemon-tty`**
is an alias (compatibility).

### 17.1. Installation

After `npm install` in `agent-deamon-framework/`, binaries are at
`node_modules/.bin/adf` and `node_modules/.bin/agent-daemon-tty`.

**Global** install from clone (builds `cli/` and runs `npm install -g ./cli`):

```bash
npm run install:cli
```

For `adf run daemon` and `adf run web` to find the monorepo, the CLI resolves
root (`daemon/` and `web/`) in this order: env **`ADF_FRAMEWORK_ROOT`**, walk
up from cwd, walk up from installed executable path. With `-g` and working
outside the clone, set `ADF_FRAMEWORK_ROOT` to the absolute repo path. See README
and `docs/USER_GUIDE.md`.

### 17.2. Commands (`adf`)

| Command | Description |
|---------|-------------|
| `adf run daemon` | Starts daemon **foreground** (console logs; `npm run dev` for `daemon` workspace). |
| `adf run web` | Starts web demo (Vite) foreground. |
| `adf stop` | Stops processes listening on `AGENT_DAEMON_PORT` and `ADF_WEB_PORT` (defaults 8787 and 5173): SIGTERM then SIGKILL if needed. |
| `adf chat` | REPL only; daemon must already be listening. |

### 17.3. Commands (`agent-daemon-tty`, alias)

| Command | Description |
|---------|-------------|
| `agent-daemon-tty` or `… up` | If `/api/health` fails, starts daemon **background** (`npm run dev` in `daemon/`) then opens chat. |
| `agent-daemon-tty chat` | Same as `adf chat`. |
| `agent-daemon-tty serve` | Same as `adf run daemon`. |

Options (valid for `adf chat` and `agent-daemon-tty`):

- `--url <base>` — daemon base (default `AGENT_DAEMON_URL` or
  `http://127.0.0.1:8787`).
- `--engine <id>` — initial engine if available.

Daemon subprocess **inherits** `process.env` (incl. `AGENT_DAEMON_PORT`,
`AGENT_DAEMON_HOST`, `AGENT_DAEMON_CWD`).

### 17.4. REPL shortcuts

| Input | Action |
|-------|--------|
| `/engines`, `/refresh` | Call `GET /api/engines` again. |
| `/engine <id>` or `/use <id>` | Switch active engine (only if `available`). |
| `/quit` | Exit. |
| `?`, `/help` | Help. |
| *other text* | `POST /api/chat` with SSE to stdout. |
| **Ctrl+C** | Abort current request. |

### 17.5. From npm at monorepo root

```bash
npx adf chat
```

---

## 18. Appendix: minimal TypeScript client

Minimal incremental SSE parser (same approach as `web/` demo):

```typescript
type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "log"; stream: "stdout" | "stderr"; message: string }
  | { type: "done" }
  | { type: "error"; message: string };

function parseSseBuffer(buf: string): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = [];
  const parts = buf.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const block of parts) {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      events.push(JSON.parse(raw) as StreamEvent);
    }
  }
  return { events, rest };
}

export async function chatStream(
  baseUrl: string,
  engineId: string,
  message: string,
  onEvent: (e: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ engineId, message }),
    signal,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(JSON.stringify(j));
  }
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let carry = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    carry += dec.decode(value, { stream: true });
    const { events, rest } = parseSseBuffer(carry);
    carry = rest;
    for (const ev of events) onEvent(ev);
  }
}
```

Usage:

```typescript
await chatStream(
  "http://127.0.0.1:8787",
  "claude",
  "hello",
  (ev) => console.log(ev),
  AbortSignal.timeout(30_000),
);
```

---

## Executive summary

1. Start the daemon and validate `GET /api/health` and `GET /api/engines`.
2. Pick `engineId` with `available: true`.
3. Call `POST /api/chat` with JSON; read **SSE** until `done` or `error`.
4. In the browser, **proxy** `/api` or extend CORS.
5. Treat the daemon as a **sensitive surface**: loopback, auth, and policies
   are your product’s responsibility in real environments.

For the visual demo and reference proxy, see `web/`; for TTY, see `cli/` in the
same monorepo.
