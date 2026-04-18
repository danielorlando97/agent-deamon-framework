## Context

The `agent-deamon-framework/` directory is the home for a TypeScript **local
daemon** that bridges upper layers (web apps, APIs) to **local agent CLIs**
via subprocesses and normalized streaming. Multica and Paperclip in this
workspace inform patterns (REST + SSE, adapter-style engines) but are out of
scope for this MVP. The proposal introduces a minimal **echo/mock** path plus
optional real CLI wiring later.

## Goals / Non-Goals

**Goals:**

- Monorepo with `daemon` (Node 20+, TypeScript) and `web` (Vite + React + TS).
- Daemon exposes JSON over HTTP for discovery and **SSE** for streaming chat
  events (simple browser consumption, easy to debug with `curl`).
- Engine abstraction: each engine implements the same internal contract
  (start turn → async iterable or callback of typed events; support
  `AbortSignal` for cancel).
- Dev ergonomics: Vite proxy `/api` → daemon port; single `npm run dev` at
  root via `concurrently` (or documented two terminals).

**Non-Goals:**

- Production auth (mTLS, OAuth), multi-tenant isolation, or secure remote
  exposure of the daemon (bind `127.0.0.1` only for MVP).
- Full parity with Multica stream parsers or Paperclip heartbeat/budgets.
- Windows-specific polish in v1 (Unix-first signals and paths are acceptable
  for the spike).

## Decisions

1. **HTTP + SSE instead of WebSocket for chat stream**  
   **Rationale:** One-way assistant deltas map naturally to SSE; less moving
   parts than WS for a spike. Cancel can use a separate `POST` with `runId` or
   abort server-side on disconnect (document trade-off).  
   **Alternative considered:** WebSocket — better for duplex cancel; defer if
   SSE proves insufficient.

2. **Hono on `@hono/node-server`**  
   **Rationale:** Lightweight, good TypeScript ergonomics, trivial SSE helpers.  
   **Alternative considered:** Fastify — heavier plugin model for an MVP.

3. **Zod at HTTP boundaries**  
   **Rationale:** Validate `engineId` and message payloads before spawn.  
   **Alternative considered:** No validation — faster to type, worse failures.

4. **Engines: built-in `echo` + optional `mock-stream`; real CLIs gated**  
   **Rationale:** UI must work in CI and fresh laptops without credentials.
   Optional `claude` (or similar) behind `PATH` detection and clear docs, with
  minimal parsing (assistant `text` blocks + `log` forward) when added.  
   **Alternative considered:** Only real CLIs — brittle for demos.

5. **Bind `127.0.0.1` and configurable `PORT` (default e.g. 8787)**  
   **Rationale:** Reduces accidental LAN exposure during local experiments.

## Risks / Trade-offs

- **[Risk] SSE and proxies buffer oddly** → Mitigation: flush-friendly SSE
  framing; document Nginx buffering if ever proxied.
- **[Risk] Subprocess hang or huge stdout** → Mitigation: line-based reads with
  buffer cap; default timeout; kill tree on abort.
- **[Risk] CLI format drift** → Mitigation: version detection where possible;
  treat parse errors as engine-level failures with stderr excerpt in events.
- **[Trade-off] No durable chat history server-side** → Accept for MVP; UI may
  keep in-memory transcript only.

## Migration Plan

Not applicable: greenfield under `agent-deamon-framework/`. Rollback is delete
folder and remove any root workspace references.

## Open Questions

- Whether v1 includes a **real** Claude Code stream-json driver or stops at
  echo/mock until a follow-up change.
- Exact default **port** and env prefix (`AGENT_DAEMON_*` vs `MULTICA_*` style).
