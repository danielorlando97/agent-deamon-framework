# User guide — Agent daemon framework

This guide is for **people who want to use** the project on their machine: web
UI, terminal chat, or quick checks. You do not need to read code.

---

## 1. What is this?

It is a **local program** (the *daemon*) that:

- Listens on your machine (by default `http://127.0.0.1:8787`).
- Offers a list of **engines**: demo engines and engines that run command-line
  tools you already have installed (Claude Code, Codex, etc.), **if they are on
  PATH** and configured.
- When you send a message, the daemon **orchestrates** the chosen engine and
  returns the response **in streaming** (chunk by chunk), same in the browser
  and in the terminal.

**Important:** it does not replace vendor accounts or licenses. If Codex or
another engine reports no quota or missing authentication, that depends on the
vendor, not this project.

---

## 2. Requirements

- **Node.js 20 or newer** ([nodejs.org](https://nodejs.org)).
- Terminal (macOS, Linux, or WSL on Windows).
- Optional: modern **browser** for the web demo.

---

## 3. Installation (once per folder)

1. Open a terminal.
2. Go to the project directory:

   ```bash
   cd path/to/agent-deamon-framework
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

If this fails, check your Node version (`node -v`).

### 3.1 `adf` command on PATH (optional)

After `npm install` you can install the CLI globally **from this clone** (no
need to publish the package to npm):

```bash
npm run install:cli
```

Then you can type **`adf`** in any terminal. For `adf run daemon` / `adf run
web` to find the monorepo, do **one** of the following:

- Run `adf` with the current directory **inside the clone** (subfolders count;
  the CLI walks up until it finds `daemon/` and `web/`).
- Or export the path to the repository root:

  ```bash
  export ADF_FRAMEWORK_ROOT=/absolute/path/to/agent-deamon-framework
  ```

To remove the global install:

```bash
npm run unlink:cli
```

More detail in the root [README.md](../README.md).

---

## 4. Start the web UI (recommended to begin)

In the project folder, open **two** terminals:

**Terminal 1 — daemon (API):**

```bash
adf run daemon
```

**Terminal 2 — web (Vite):**

```bash
adf run web
```

Typical endpoints:

| What | Typical URL |
|------|-------------|
| **Web** (visual chat) | [http://localhost:5173](http://localhost:5173) |
| **Daemon** (API) | `http://127.0.0.1:8787` (the web app proxies `/api` to the same host/port you set in `AGENT_DAEMON_*`) |

Open the web URL in your browser. You will see:

- An **engine panel** on the left: engines marked “ready” can be used;
  “absent” or disabled ones cannot.
- A **chat area** and a field at the bottom to type and send.

**Tip:** use `localhost` in the browser as Vite suggests; avoid mixing
`127.0.0.1` and `localhost` if you see cookie or CORS warnings in other
setups.

To **stop** each service: press `Ctrl+C` in its terminal.

---

## 5. Terminal-only chat (CLI)

The main CLI is **`adf`** (legacy binary **`agent-daemon-tty`** points to the
same program). It talks **only** to the daemon over the network (same API as
the web). The daemon must be running first (e.g. `adf run daemon`).

### 5.1. If the daemon is already running

```bash
adf chat
```

You will see a banner and a `>` prompt. Type your message and press **Enter**.

### 5.2. If you want the legacy binary to start the daemon by itself

```bash
npx agent-daemon-tty
```

If nothing responds on the configured port, it will try to start the daemon in
the background and then open chat. With **`adf`**, use `adf run daemon` in
another terminal, then `adf chat`.

### 5.3. Watch daemon logs only (advanced)

```bash
adf run daemon
```

Here the daemon owns the terminal; open **another** terminal for `adf chat` if
you want both.

### 5.4. Commands inside the CLI

| You type… | Effect |
|-----------|--------|
| `/engines` or `/refresh` | Reload the engine list. |
| `/engine <id>` (or `/use <id>`) | Switch to the given engine (if available). |
| `/quit` or `/q` | Exit the CLI. |
| `?` or `/help` | Short help. |
| **Ctrl+C** | Abort the response being generated. |

---

## 6. Engines: what each one means

In the list you will see identifiers (`id`). Full list and registry order:
[QUICKSTART.md §4 — Engines](QUICKSTART.md#4-engines-engineid). Summary:

| Engine | Purpose |
|--------|---------|
| **claude**, **codex**, **cursor_agent**, **opencode**, **pi**, **qwen** | Only show as ready if the command exists on your system (`command -v`). You must **log in or configure** each tool yourself. |

If an engine is unavailable, install or configure that tool and restart the
daemon or refresh in the web UI / `/refresh` in the CLI.

---

## 7. Environment variables (common)

You can set these **before** `adf run daemon`, `adf run web`, `adf chat`, etc.:

| Variable | Purpose |
|----------|---------|
| `AGENT_DAEMON_PORT` | Daemon port (default `8787`). |
| `AGENT_DAEMON_HOST` | Bind address (default `127.0.0.1`). |
| `AGENT_DAEMON_CWD` | Working directory where CLIs open files (default: where you started the process). |
| `AGENT_DAEMON_TIMEOUT_MS` | Max time for a long response (real engines). |
| `AGENT_DAEMON_URL` | Base URL used by the CLI (default `http://127.0.0.1:8787`). |
| `ADF_FRAMEWORK_ROOT` | Monorepo root (with `daemon/` and `web/`). Useful if you installed `adf` with `npm install -g` and run commands outside the clone. |

Example: use port 8877 for **both** daemon startup, Vite proxy, and CLI:

```bash
export AGENT_DAEMON_PORT=8877
export AGENT_DAEMON_URL=http://127.0.0.1:8877
adf run daemon
# other terminal: AGENT_DAEMON_PORT=8877 adf run web
# other terminal: adf chat
```

---

## 8. Troubleshooting (FAQ)

**The web UI does not load or cannot reach the API.**  
Make sure the daemon is running and Vite proxies to the same port (`web/vite.config.ts`). Try in the terminal:
`curl http://127.0.0.1:8787/api/health` — it should return `{"ok":true}`.

**All engines show “Offline” / CLI says engine unavailable.**  
There are no demo engines anymore: you need **at least one** CLI from the list
(`claude`, `codex`, etc.) on `PATH`. Check with `GET /api/engines` or `/engines`
in the CLI.

**A “real” engine fails or reports usage limits.**  
That comes from the provider (OpenAI, Anthropic, etc.). Check accounts, plans,
and CLI login **outside** this project.

**The CLI says there is no “carrier”.**  
The daemon is not listening. Start `adf run daemon` in another terminal.

**Port in use (`EADDRINUSE`).**  
Another program (or another daemon) is using that port. Change `AGENT_DAEMON_PORT`
or stop the other process.

---

## 9. Security (quick read)

By default the daemon listens on **your machine only** (loopback). It is not
meant to be exposed to the internet without strong authentication, firewall, and
TLS. Treat messages you send as **able to trigger actions** in your environment
if the engine uses tools with disk access.

---

## 10. Where to go next

- **Integrate** this daemon in your own app: [INTEGRATION.md](INTEGRATION.md).
- **Architecture and code:** [TECHNICAL.md](TECHNICAL.md).
- **Quick start at repo root:** [README.md](../README.md).
