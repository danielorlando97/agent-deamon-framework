## Why

Local coding CLIs (Claude Code, Codex, and others) are powerful but each speaks a
different protocol and expects credentials on the machine. We need a small,
agnostic **edge daemon** in TypeScript that wraps subprocess execution and
normalizes streaming, plus a **minimal chat UI** to prove the loop: discover
engines, send a message, see streamed output. This change establishes that
foundation under `agent-deamon-framework/` without pulling in a full control
plane like Multica or Paperclip.

## What Changes

- Add an npm workspace (or equivalent) with a **daemon** package: HTTP API,
  engine registry, and Server-Sent Events (SSE) for chat streaming.
- Add a **web** package: Vite + React chat that lists available engines and
  drives the daemon API (dev proxy to avoid CORS friction).
- Ship at least one **always-on demo engine** (echo or mock stream) so the UI
  works without local CLIs; optionally register engines when binaries exist on
  `PATH` (documented, best-effort).
- Document how to run both processes in development and constraints (local
  only, not production-hardened).

## Capabilities

### New Capabilities

- `local-daemon-runtime`: HTTP surface for listing engines, starting a chat
  turn, streaming normalized events over SSE, and process lifecycle (spawn,
  timeout, cancel) for engine implementations.
- `daemon-chat-ui`: Web UI to select an engine, send messages, render streamed
  assistant deltas and basic status/errors.

### Modified Capabilities

- None (no existing `openspec/specs/` capabilities in this repository).

## Impact

- New code under `agent-deamon-framework/` (root `package.json` workspaces,
  `daemon/`, `web/`).
- New dev dependencies: Node 20+, npm; runtime deps scoped per package (e.g.
  Hono, Vite, React).
- No changes to `multica/` or `paperclip/`; they remain reference only.
