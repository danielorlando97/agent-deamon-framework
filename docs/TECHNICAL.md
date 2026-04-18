# Documentación técnica — Agent daemon framework

Visión orientada a **mantenimiento, extensión e integración** del monorepo
`agent-deamon-framework`. Complementa [INTEGRATION.md](INTEGRATION.md), que se
centra en el contrato HTTP/SSE para productos externos.

---

## 1. Alcance del MVP

| Incluido | Fuera de alcance (MVP) |
|----------|-------------------------|
| Daemon HTTP local (Hono) | Autenticación en el daemon |
| Catálogo de motores + ejecución + SSE | Persistencia de conversaciones en servidor |
| Demo web (Vite + React) | Multi-tenant |
| CLI que usa `fetch` + instalación global opcional desde el clon (`npm install -g ./cli`) | Versión estable publicada en npm registry (opcional futuro) |
| Detección `command -v` para CLIs | Matriz de versiones soportadas por CLI |

---

## 2. Estructura de workspaces (npm)

Raíz: `agent-deamon-framework/package.json`

```json
"workspaces": ["daemon", "web", "cli"]
```

| Paquete | Ruta | Rol |
|---------|------|-----|
| `daemon` | `daemon/` | Servidor Node: rutas `/api/*`, registro de motores, SSE. |
| `web` | `web/` | SPA React: proxy `/api` → daemon en desarrollo. |
| `cli` | `cli/` | Binarios `adf` y `agent-daemon-tty` (alias): cliente HTTP; spawn en segundo plano solo en el flujo legacy `up`. |

Dependencias compartidas se **hoistean** a `node_modules/` en la raíz del
monorepo (p. ej. `tsx` para el launcher de la CLI y el daemon en dev).

---

## 3. Diagrama lógico

```
                    ┌──────────────┐
                    │   browser    │
                    │   (web/)     │
                    └──────┬───────┘
                           │ HTTP same-origin
                           │  /api → proxy →
                           ▼
┌──────────────┐     HTTP      ┌─────────────────┐
│  adf /       │◄──────────────│  cli/ (adf)     │
│  agent-daemon│   localhost   │                 │
│  -tty        │               │                 │
└──────┬───────┘               └────────┬────────┘
       │                                │
       │  spawn (solo bin legacy `up`)  │
       ▼                                │
┌──────────────────────────────────────┴───────┐
│              daemon/ (Hono)                 │
│  GET /api/engines  GET /api/engine-models  POST /api/chat (SSE)     │
└──────────────────────┬──────────────────────┘
                       │ EngineDefinition.run()
                       ▼
              ┌────────────────┐
              │  adaptadores/  │
              │  (CLI engines) │
              └────────────────┘
```

La **web** y la **cli** no importan `daemon/src/*`; solo consumen URLs HTTP.

---

## 4. Paquete `daemon/`

### 4.1. Stack

- **Runtime:** Node 20+, ESM (`"type": "module"`).
- **Framework HTTP:** [Hono](https://hono.dev/) + `@hono/node-server` (`serve`).
- **Validación:** Zod (`schemas.ts`).
- **Streaming:** `hono/streaming` → `streamSSE`, eventos JSON en campo `data`.

### 4.2. Punto de entrada

`daemon/src/index.ts`

- CORS aplicado a `/api/*` (lista fija de orígenes Vite).
- Rutas: `GET /api/health`, `GET /api/engines`, `GET /api/engine-models`,
  `POST /api/chat`.

### 4.3. Configuración

`daemon/src/config.ts` lee:

- `AGENT_DAEMON_HOST` (default `127.0.0.1`)
- `AGENT_DAEMON_PORT` (default `8787`)
- `AGENT_DAEMON_TIMEOUT_MS` (default 20 min)
- `AGENT_DAEMON_CWD` (default `process.cwd()`)

### 4.4. Motores (engines)

| Archivo | Contenido |
|---------|-----------|
| `engines/types.ts` | `StreamEvent`, `EngineDefinition`, `EmitFn`. |
| `engines/registry.ts` | Ensambla solo `subprocessEngines()` desde `adaptadores/`. |
| `engines/adaptadores/subprocess-engines.ts` | Solo agrega el array: importa un `.ts` por motor CLI. |
| `engines/adaptadores/claude.ts`, `codex.ts`, `cursor-agent.ts`, `opencode.ts`, `pi.ts`, `qwen.ts` | Un motor subprocess por archivo (comentario de invocación CLI arriba). |
| `engines/adaptadores/lib/*.ts` | Utilidades compartidas (JSON por línea, cierre de proceso, formato Claude). |
| `engines/spawn-helpers.ts` | `runLineProcess`: stdin opcional, líneas stdout, timeout, señales. |
| `engines/engine-env.ts` | Sufijo `engineId` → `AGENT_ENGINE_*_ARGS_JSON`, parseo/caps de argv extra, metadata `integration` en el listado HTTP. |
| `engines/list-models.ts` | `GET /api/engine-models`: sondea CLIs (`agent`, `opencode`, `pi`) o listas estáticas (`claude`, `codex`, `qwen`). |
| `engines/detect.ts` | `commandOnPath` vía `sh -lc command -v`. |

**Contrato interno:** `run(ctx)` recibe `message`, `cwd`, `timeoutMs`, `signal`,
`emit` (async). Debe terminar con evento terminal vía `done` o `error` en la
mayoría de flujos felices; errores no capturados los envuelve `index.ts`.

### 4.5. Añadir un motor nuevo (checklist técnico)

1. Añadir `create…Engine(timeoutMs)` en un archivo nuevo bajo
   `engines/adaptadores/` (o demo allí) y exportarlo desde
   `adaptadores/subprocess-engines.ts` si es CLI externo.
2. Registrar en `engines/registry.ts` (`allEngines()`).
3. Si usa subproceso, preferir `runLineProcess` y parseo incremental robusto.
4. Añadir fila en README / USER_GUIDE si es visible al usuario.
5. Probar con `curl` + demo web + CLI.

---

## 5. Paquete `web/`

- **Build tool:** Vite 6, React 19.
- **Proxy:** `vite.config.ts` → `/api` a `http://127.0.0.1:8787`.
- **UI principal:** `web/src/App.tsx` — estado local, `fetch` + lectura SSE
  manual del body (no `EventSource` por ser POST).

**Nota:** el diseño es demo; no hay enrutador ni estado global.

---

## 6. Paquete `cli/`

### 6.1. Arranque del binario

`cli/bin/adf.mjs` es el shebang Node que importa `cli/dist/cli.js` (salida de
`tsc`). Los binarios npm declarados son **`adf`** y **`agent-daemon-tty`**
(apuntan al mismo archivo).

### 6.2. Módulos

| Archivo | Responsabilidad |
|---------|-----------------|
| `cli/src/cli.ts` | Parsing de argv, comandos `run daemon` / `run web` / `stop` / `chat`, REPL SSE, modo legacy `agent-daemon-tty`, detección del monorepo y `spawn` de `npm run dev` en `daemon/` y `web/`. |

### 6.3. Resolución del monorepo

`findFrameworkRoot()` necesita la raíz que contiene **`daemon/package.json`** y
**`web/package.json`**. Orden:

1. **`ADF_FRAMEWORK_ROOT`** (ruta absoluta al clon) — útil con **`npm install -g`** fuera del árbol del repo.
2. Subida desde **`process.cwd()`**.
3. Subida desde el directorio del **`cli.js`** instalado (`npx adf`, `node_modules/.bin`).

Scripts: **`npm run install:cli`**, **`scripts/install-cli.sh`**, **`npm link`**
en `cli/`. Ver [README.md](../README.md).

---

## 7. Contrato API (resumen)

Detalle completo en [INTEGRATION.md §6–7](INTEGRATION.md).

- `GET /api/health` → `{ ok: true }`
- `GET /api/engines` → `{ engines: EngineInfo[] }`
- `GET /api/engine-models` → `{ engines: EngineModelsPayload[] }` (modelos por
  motor: CLI o lista estática; ver `engines/list-models.ts`).
- `POST /api/chat` → cuerpo `{ engineId, message, engineOptions?, model? }`
  (`engineOptions` estricto; ver `daemon/src/schemas.ts`), respuesta
  `text/event-stream` con JSON por evento `data:`.

---

## 8. Scripts y utilidades

| Ruta | Uso |
|------|-----|
| `scripts/smoke.sh` | `curl` a health, engines y un turno de chat con el primer motor `available` (requiere `jq`). |
| `adf run daemon` / `adf run web` | Arranque en desarrollo desde la raíz del monorepo. |
| `adf chat` | REPL contra el daemon ya levantado. |

---

## 9. Calidad y pruebas manuales

No hay suite E2E automatizada en CI en este MVP. Checklist habitual:

1. `npm install` en la raíz del monorepo.
2. `curl` health + engines + POST chat con un motor disponible.
3. `adf run daemon` + `adf run web` — flujo web (lista, enviar, streaming).
4. `adf chat` con daemon ya arriba.
5. `AGENT_DAEMON_PORT=8877 npx agent-daemon-tty --url http://127.0.0.1:8877` —
   arranque legacy `up` sin conflicto con 8787.

---

## 10. Limitaciones y deuda técnica conocida

- **CORS** fijo en código; integración desde otros orígenes requiere proxy o
  cambio en `daemon/src/index.ts`.
- **Errores de CLI** a veces se resumen como `exit 1` sin propagar el JSON de
  error del proveedor al evento SSE (mejora posible en parsers).
- **Pi / motores lentos:** timeouts y UX de cancelación dependen del usuario
  (`Ctrl+C` / abort en fetch).
- **Windows:** rutas y señales de subprocesos no son el foco del MVP (probado
  principalmente en Unix).

---

## 11. Documentación relacionada

- [Índice `docs/README.md`](README.md)
- [Guía de usuario](USER_GUIDE.md)
- [Integración en productos](INTEGRATION.md)
- [README raíz (quick start)](../README.md)
