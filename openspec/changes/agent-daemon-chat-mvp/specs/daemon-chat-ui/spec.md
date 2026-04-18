## ADDED Requirements

### Requirement: Engine list visible before chat

The web application SHALL fetch the daemon’s engine list on load (or on first
navigation to chat) and MUST render every returned engine. The user MUST be able
to see which engines are `available` versus unavailable before sending a
message.

#### Scenario: Demo engine is selectable

- **WHEN** the page loads successfully against a running daemon
- **THEN** at least one engine with `available: true` is shown and can be
  selected as the active engine

#### Scenario: Unavailable engine cannot be used for send

- **WHEN** the user selects an engine with `available: false`
- **THEN** the send action is disabled or shows a clear message that the
  engine cannot run

### Requirement: Send message and stream assistant output

The web application SHALL let the user enter a message and send it to the
daemon for the selected engine. While the stream is active, the UI MUST append
incoming assistant text (delta events) to the visible transcript. The UI MUST
display a loading or streaming state until a terminal event is received.

#### Scenario: Happy path with demo engine

- **WHEN** the user selects an available demo engine, enters text, and sends
- **THEN** the user message appears in the transcript and assistant content
  appears incrementally from SSE until completion

#### Scenario: Error surfaced to user

- **WHEN** the daemon returns 4xx/5xx or the SSE contains an `error` terminal
  event
- **THEN** the UI shows an actionable error state without silently dropping the
  failure

### Requirement: Development integration

The web application SHALL be configurable so that in local development API
calls (including SSE) reach the daemon without manual CORS configuration
(documented approach: Vite dev server proxy or equivalent).

#### Scenario: Dev proxy documented and default

- **WHEN** a developer follows README instructions for local dev
- **THEN** the web app’s API base path resolves to the daemon through the
  documented proxy or env configuration
