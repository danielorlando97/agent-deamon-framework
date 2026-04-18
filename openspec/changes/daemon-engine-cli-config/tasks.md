## 1. Core parsing and encoding

- [x] 1.1 Add `engineIdToEnvSuffix(engineId: string): string` (uppercase,
      non-alphanumerics → `_`) with unit tests or inline tests in a small module
      under `daemon/src/engines/`.
- [x] 1.2 Implement `parseArgsJson(raw: string | undefined): string[] | null`
      with bounds (max tokens, max token length, max JSON bytes).
- [x] 1.3 Export `getEngineArgvExtras(engineId)` reading
      `AGENT_ENGINE_<SUFFIX>_ARGS_JSON` from `process.env`.

## 2. Wire into adapters

- [x] 2.1 For each adapter in `adaptadores/`, merge `getEngineArgvExtras` into
      `runLineProcess` args at the documented position (document merge order in
      the file header).
- [x] 2.2 ~~Merge env JSON~~ **Removed:** child env is only adapter defaults +
      inherited `process.env` (no `*_ENV_JSON`).
- [ ] 2.3 Remove or trim redundant pasted `--help` blocks only if superseded by
      a short pointer to INTEGRATION (optional cleanup).

## 3. HTTP surface and types

- [x] 3.1 Extend `EngineInfo` with optional `integration` metadata (`argvJsonEnvKey`,
      `engineIdEnvSuffix`) and populate in `listEngineInfos()`.
- [x] 3.2 Ensure `GET /api/engines` JSON matches the spec.
- [x] 3.3 Engines list is not Zod-validated (`schemas.ts` is chat-only).

## 4. Documentation

- [x] 4.1 `docs/INTEGRATION.md` §10.1: `AGENT_ENGINE_*_ARGS_JSON`, encoding,
      merge precedence (argv only).
- [x] 4.2 `docs/TECHNICAL.md` engine table mentions `engine-env.ts`.
- [x] 4.3 `README.md` / `QUICKSTART.md` pointer for tuning argv via env.

## 5. Verification

- [x] 5.1 `ARGS_JSON` read path covered by tests / manual smoke.
- [x] 5.2 `curl /api/engines | jq '.engines[0].integration'` shows argv key +
      suffix.
