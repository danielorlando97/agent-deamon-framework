## 1. Repository layout

- [x] 1.1 Add root `package.json` under `agent-deamon-framework/` with npm
  workspaces for `daemon` and `web`, plus a root `dev` script (e.g.
  `concurrently`) to run both packages.
- [x] 1.2 Add minimal `README.md` at `agent-deamon-framework/` with Node
  version, install, and how to start daemon + web.

## 2. Daemon (`agent-deamon-framework/daemon`)

- [x] 2.1 Scaffold TypeScript package (tsx dev, build to `dist/` or run with
  tsx), Hono + `@hono/node-server`, Zod for request validation.
- [x] 2.2 Implement `GET /api/engines` returning JSON per
  `local-daemon-runtime` spec (built-in demo engine always `available: true`;
  optional engines marked `available: false` when missing).
- [x] 2.3 Implement `POST /api/chat` (or equivalent) that validates body,
  rejects unknown or unavailable `engineId` with 4xx JSON, otherwise returns
  SSE with JSON events (`delta`, `log`, `done`, `error`).
- [x] 2.4 Implement demo `echo` engine (and optional `mock-stream`) honoring
  `AbortSignal` on request abort.
- [x] 2.5 Bind default host `127.0.0.1` and configurable `PORT` (and optional
  bind override) via environment variables.
- [x] 2.6 Add subprocess timeout and cleanup for any engine that uses `spawn`
  (stub or real CLI in a follow-up task).

## 3. Web UI (`agent-deamon-framework/web`)

- [x] 3.1 Scaffold Vite + React + TypeScript with a single main view (no
  router required for MVP).
- [x] 3.2 Configure dev proxy so `/api` targets the daemon (per
  `daemon-chat-ui` spec); document `VITE_*` if any client-side base URL is
  needed.
- [x] 3.3 On load, fetch engines and render list with clear `available` state;
  disable send when selected engine is unavailable.
- [x] 3.4 Implement chat transcript (user + assistant), message input, and SSE
  consumer that appends `delta` text until terminal event; show errors on HTTP
  or stream failure.

## 4. Verification

- [x] 4.1 Manually verify: engines list, send with demo engine, stream
  completes, unavailable engine cannot send.
- [x] 4.2 (Optional) Add a minimal smoke script or document `curl` examples
  for `GET /api/engines` and SSE chat.
