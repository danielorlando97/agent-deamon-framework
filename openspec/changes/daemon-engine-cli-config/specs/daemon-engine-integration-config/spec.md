## ADDED Requirements

### Requirement: Per-engine extra argv from environment

The daemon SHALL read an optional environment variable
`AGENT_ENGINE_<ENGINEID>_ARGS_JSON` where `<ENGINEID>` is the engine’s public
`id` transformed to uppercase ASCII with non-alphanumeric characters replaced
by `_` (for example `cursor_agent` → `CURSOR_AGENT`). When set to valid JSON
array of strings, the daemon SHALL append those strings to the subprocess argv
for that engine according to the per-engine merge order documented in that
engine’s adapter module. When unset or invalid, the daemon SHALL behave as
today (no extra argv).

#### Scenario: Valid JSON array adds flags

- **WHEN** `AGENT_ENGINE_CLAUDE_ARGS_JSON` is set to `["--model","opus"]` and a
  chat request uses engine `claude`
- **THEN** the spawned `claude` process argv SHALL include `--model` and
  `opus` in the documented merge position relative to the adapter’s default argv

#### Scenario: Invalid JSON is ignored or rejected

- **WHEN** `AGENT_ENGINE_CLAUDE_ARGS_JSON` is set to a value that is not a JSON
  array of strings
- **THEN** the daemon SHALL NOT inject argv fragments from that variable and
  SHALL fall back to the adapter’s default argv only

### Requirement: Safety limits on injected argv

The implementation SHALL enforce documented upper bounds on the number of
argv tokens, maximum length per token, and total byte size of `ARGS_JSON`.
Inputs exceeding bounds SHALL be capped or rejected for that merge step without
executing shell interpolation.

#### Scenario: Oversized ARGS_JSON is capped

- **WHEN** `AGENT_ENGINE_CODEX_ARGS_JSON` exceeds the documented token or byte
  limit
- **THEN** no argv tokens beyond the allowed limit SHALL be passed to the
  `codex` subprocess

### Requirement: Engines list exposes integration metadata

The `GET /api/engines` response SHALL include, for each engine entry, an
optional object field `integration` containing at least: `argvJsonEnvKey`
(string) and `engineIdEnvSuffix` (string matching the encoding rule), so HTTP
clients can explain which environment variable supplies extra CLI flags without
scraping `--help`.

#### Scenario: Client reads env key names from engines payload

- **WHEN** a client calls `GET /api/engines`
- **THEN** each engine object in `engines[]` SHALL include an `integration`
  field as specified with the correct `argvJsonEnvKey` for that `id`

### Requirement: Documentation ties CLI vocabulary to env keys

The project documentation SHALL state the encoding rule for `<ENGINEID>`,
the meaning of `ARGS_JSON`, merge precedence vs. adapter defaults, and reference
that adapter comments mirror upstream CLI help.

#### Scenario: Integrator finds mapping in INTEGRATION guide

- **WHEN** a reader opens the integration documentation after this change is
  applied
- **THEN** the document SHALL describe `AGENT_ENGINE_*_ARGS_JSON` and the
  `integration` object on `GET /api/engines`
