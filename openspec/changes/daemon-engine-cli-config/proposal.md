## Why

Each subprocess engine under `daemon/src/engines/adaptadores/` now embeds a
paste of the upstream CLI `--help` (flags, subcommands, types) in comments,
but the daemon still **hardcodes** argv and a few env vars. Operators and
products that embed the daemon cannot align customization with the **same
vocabulary** the CLIs already expose (e.g. `--model`, `--session`, OpenCode
`--agent`) without forking adapters. Standardizing how optional CLI surface
maps from **environment (and later optional HTTP config)** unlocks integration
at the same language as each binary’s help text.

## What Changes

- Introduce a **documented, per-engine naming scheme** for optional **argv**
  only (`AGENT_ENGINE_<ID>_ARGS_JSON`), so flags in adapter comments have a
  predictable daemon-side equivalent.
- **Merge** configured argv tokens with safe defaults in each adapter; validate
  shapes (JSON array of strings, max length caps) to reduce injection risk.
- Optionally extend **`GET /api/engines`** (or a companion read-only route) with
  **machine-readable hints** (flag names, types, env key names) so web and
  other clients can build settings UIs without duplicating `--help` parsers.
- Update **INTEGRATION.md** and adapter file headers so “CLI language ↔ daemon
  config language” stays in sync.
- **BREAKING**: only if existing env vars are renamed or default argv changes
  behavior; prefer additive env keys and preserve current invocations as the
  baseline when unset.

## Capabilities

### New Capabilities

- `daemon-engine-integration-config`: Discoverable, env-driven **argv** tuning
  for subprocess engines so integrators use the same flag concepts as each CLI’s
  `--help`, without editing TypeScript for common cases.

### Modified Capabilities

- _(none — no baseline `openspec/specs/` in this repo.)_

## Impact

- All files under `daemon/src/engines/adaptadores/*.ts`, `spawn-helpers.ts`,
  `registry.ts`, `daemon/src/config.ts` (or a new small `engine-options.ts`
  module), `schemas.ts` / `index.ts` if HTTP surface grows.
- **Docs:** `docs/INTEGRATION.md`, `docs/TECHNICAL.md`, possibly `README` engine
  section.
- **Clients:** web demo may consume new metadata fields when present.
