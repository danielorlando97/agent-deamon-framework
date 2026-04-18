## ADDED Requirements

### Requirement: Engine discovery

The local daemon SHALL expose an HTTP endpoint that returns a JSON list of
engines. Each entry MUST include a stable `id`, human-readable `label`, short
`description`, and boolean `available`. Engines that require missing binaries or
configuration MUST be listed with `available: false` and MUST NOT be started
for execution.

#### Scenario: List includes at least one demo engine

- **WHEN** a client calls the engine list endpoint with an acceptable `GET`
  request
- **THEN** the response body is JSON containing at least one engine with
  `available: true` (the built-in demo engine)

#### Scenario: Unavailable engine is marked

- **WHEN** an optional engine’s binary is not on `PATH` or fails a lightweight
  prerequisite check
- **THEN** that engine appears in the list with `available: false` (or is
  omitted entirely, but MUST NOT be executable via the chat endpoint)

### Requirement: Chat turn with streaming events

The local daemon SHALL accept a chat request specifying `engineId` and user
message content. If the engine is available, the daemon MUST respond with
`text/event-stream` (SSE) and emit a sequence of JSON-serialized events until a
terminal `done` or `error` event. If the engine is unavailable or `engineId` is
unknown, the daemon MUST respond with a non-2xx HTTP status and a JSON error
body (not SSE).

#### Scenario: Successful stream completes

- **WHEN** the client posts a valid chat request for an `available` engine
- **THEN** the response uses SSE and includes at least one non-terminal event
  followed by a terminal `done` or `error` event

#### Scenario: Invalid engine rejected

- **WHEN** the client posts a chat request with an unknown `engineId`
- **THEN** the server responds with HTTP 4xx and does not open an SSE stream

### Requirement: Cancellation and timeout

For engine implementations that spawn subprocesses, the daemon MUST enforce a
configurable maximum duration per turn and MUST terminate the child process
(and avoid zombies) on timeout or explicit cancellation. Demo engines that do
not spawn processes MUST still honor `AbortSignal` when the HTTP request is
aborted.

#### Scenario: Timeout stops subprocess

- **WHEN** a subprocess-based engine exceeds the configured timeout
- **THEN** the stream emits an `error` (or equivalent terminal) event and the
  subprocess is no longer running

### Requirement: Local-only binding by default

The daemon SHALL listen on `127.0.0.1` by default. The listen address MUST be
overridable via environment variable for advanced setups.

#### Scenario: Default bind is loopback

- **WHEN** the daemon starts with default configuration
- **THEN** it accepts connections only on the loopback interface (not `0.0.0.0`
  by default)
