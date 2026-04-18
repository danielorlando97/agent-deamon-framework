## Context

Subprocess engines live under `engines/adaptadores/`. Each file documents the
upstream CLI with pasted `--help` output in comments, but `runLineProcess`
invocations still use **fixed** argv arrays and a handful of hardcoded env
keys (`OPENCODE_PERMISSION`, etc.). Global daemon config today is limited to
`AGENT_DAEMON_*` in `config.ts`. Integrators need a **single, documented bridge**
from “what the CLI accepts” to “what the daemon reads” without maintaining a
fork per deployment.

## Goals / Non-Goals

**Goals:**

- Define a **repeatable env naming scheme** per `engineId` (uppercase, safe
  characters) for optional argv fragments only (`*_ARGS_JSON`).
- Centralize **parsing, merging, and caps** (length, token count) before spawn.
- Extend the **engines HTTP surface** so clients can render or validate options
  using structured metadata aligned with adapter comments / CLI vocabulary.
- Keep **defaults identical** when no new env vars are set (additive change).

**Non-Goals:**

- Parsing arbitrary `--help` text at runtime from binaries.
- Per-user persisted settings in the daemon (still env / future HTTP body).
- Changing streaming JSON contracts for `POST /api/chat`.

## Decisions

1. **Primary control surface: environment variables**  
   Rationale: matches how the daemon is already operated in production shells,
   Compose, and systemd. HTTP request overrides can be a follow-up once env
   story is stable.

2. **Per-engine argv extras: `AGENT_ENGINE_<ENGINEID>_ARGS_JSON`**  
   `ENGINEID` is the public `id` with non-alphanumerics mapped to `_` (e.g.
   `cursor_agent` → `CURSOR_AGENT`). Value is a JSON **array of strings** merged
   after default argv (or inserted before positional prompt where documented per
   engine). Alternatives considered: space-separated string (ambiguous);
   single `EXTRA_FLAGS` string (shell injection risk higher).

3. **Discovery: extend `GET /api/engines` entries**  
   Add optional field `integration` with `argvJsonEnvKey` and
   `engineIdEnvSuffix` static per engine from TypeScript—not scraped from CLI.

4. **Implementation module**  
   `engines/engine-env.ts` exports suffix encoding, `parseArgsJson`, and
   `getEngineArgvExtras(engineId)` used by adapters. Child processes inherit the
   daemon’s `process.env`; no per-engine `*_ENV_JSON` merge (avoids leaking
   config through the whole environment model).

5. **Security**  
   Reject non-array JSON for args; max tokens (e.g. 64) and max string length
   per token; disallow newline in tokens; no shell execution (`shell: false`
   unchanged).

## Risks / Trade-offs

- **[Risk] Misconfigured JSON breaks spawn** → **Mitigation**: log parse errors
  at engine registration or first run; fall back to defaults and surface
  `400` only when invalid config is passed via future HTTP override (env parse
  errors may log + ignore extras with warning).
- **[Risk] argv merge order differs per CLI** → **Mitigation**: document per
  engine in adapter header: “extras inserted before/after positionals”.
- **[Trade-off] Metadata drift from real `--help`** → **Mitigation**: CI or
  checklist task to refresh comments + `integration` constants together.

## Migration Plan

1. Ship env parsing + merge behind feature-transparent defaults (no env →
   current behavior).
2. Document keys in INTEGRATION + per-adapter comment block “Env bridge”.
3. Extend `GET /api/engines` response; bump minor if external clients strict
   on schema (document additive field).

## Open Questions

- Whether to support **HTTP overrides** of argv for a single request (adds
  auth and validation scope).
- Exact caps for `ARGS_JSON` (token count vs total byte size).
