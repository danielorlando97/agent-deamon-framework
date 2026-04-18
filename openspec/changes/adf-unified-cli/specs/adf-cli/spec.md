## ADDED Requirements

### Requirement: adf binary is available after install

The framework SHALL expose a command-line entry point named **`adf`** on
`PATH` after `npm install` at the `agent-deamon-framework` repository root
(workspaces), typically as `node_modules/.bin/adf` or via `npx adf` from that
directory.

#### Scenario: Invoke help from root

- **WHEN** the user runs `adf --help` or `adf -h` from the framework root after
  `npm install`
- **THEN** the process prints usage text that lists the subcommands **`run`**
  and **`chat`** (or equivalent documented structure) and exits with code 0

### Requirement: adf run daemon starts the HTTP daemon

The CLI SHALL provide **`adf run daemon`**, which starts the TypeScript daemon
that serves the documented HTTP API on the configured host and port (defaults
loopback and port consistent with existing daemon configuration).

#### Scenario: Daemon listens for health check

- **WHEN** the user runs `adf run daemon` and waits until the process has
  finished starting
- **THEN** an HTTP client MAY successfully reach the daemon health or engines
  endpoint on the configured base URL (e.g. default `127.0.0.1:8787` unless
  overridden by documented environment variables)

### Requirement: adf run web starts the Vite dev server

The CLI SHALL provide **`adf run web`**, which starts the **`web`** workspace
development server (Vite) with the same proxy rules as the existing Vite
configuration for `/api` to the default daemon base URL, unless overridden by
documented configuration.

#### Scenario: Web dev server accepts connections

- **WHEN** the user runs `adf run web` and waits until the dev server reports
  ready
- **THEN** an HTTP client MAY open the documented dev URL (default port 5173
  with strict port behavior as in existing `web` config)

### Requirement: adf chat provides console chat to the daemon

The CLI SHALL provide **`adf chat`**, which runs an interactive terminal
session that sends user input to the daemon using the same HTTP/SSE chat
contract as the web client, and streams assistant output to the terminal until
the user ends the session.

#### Scenario: Chat requires a reachable daemon

- **WHEN** the user runs `adf chat` and the daemon is not reachable at the
  configured base URL
- **THEN** the CLI SHALL print a clear error message and exit with a non-zero
  exit code

#### Scenario: Chat against healthy daemon

- **WHEN** the user runs `adf chat` while the daemon is listening and the user
  submits a message for a valid engine
- **THEN** the CLI SHALL display streamed model output (or engine-specific
  behavior) without requiring the web UI

### Requirement: Documentation prefers adf

The repository’s primary English user-facing entry (`README.md`) and English
user guide SHALL document **`adf run daemon`**, **`adf run web`**, and
**`adf chat`** as the recommended commands, with prior `npm`-only examples
updated or demoted to secondary notes where they duplicate this flow.

#### Scenario: README shows adf commands

- **WHEN** a reader opens `README.md` in the framework root after this change
  is applied
- **THEN** the “Run” or equivalent section SHALL include the three `adf`
  commands above as the main quick-start path
