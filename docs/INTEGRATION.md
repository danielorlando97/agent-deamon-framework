# Integrar el agent daemon en tus productos

Guía detallada, paso a paso, para conectar aplicaciones (web, backend, desktop)
al **daemon HTTP** del monorepo `agent-deamon-framework`. Asume que el daemon
expone la API documentada aquí (rutas bajo `/api`, streaming por SSE).

---

## Tabla de contenidos

1. [Qué es el daemon y qué problema resuelve](#1-qué-es-el-daemon-y-qué-problema-resuelve)
2. [Arquitectura recomendada](#2-arquitectura-recomendada)
3. [Requisitos previos](#3-requisitos-previos)
4. [Paso 1: Obtener y arrancar el daemon](#4-paso-1-obtener-y-arrancar-el-daemon)
5. [Paso 2: Comprobar conectividad](#5-paso-2-comprobar-conectividad)
6. [Contrato HTTP: referencia de API](#6-contrato-http-referencia-de-api)
7. [Contrato SSE: eventos de streaming](#7-contrato-sse-eventos-de-streaming)
8. [Paso 3: Integrar desde un backend (Node, Python, Go, etc.)](#8-paso-3-integrar-desde-un-backend-node-python-go-etc)
9. [Paso 4: Integrar desde una aplicación web (browser)](#9-paso-4-integrar-desde-una-aplicación-web-browser)
10. [Motores (`engineId`) y disponibilidad](#10-motores-engineid-y-disponibilidad)  
    10.1. [Flags extra (`AGENT_ENGINE_*_ARGS_JSON`)](#101-flags-extra-agent_engine_args_json)
11. [Cancelación, timeouts y ciclo de vida](#11-cancelación-timeouts-y-ciclo-de-vida)
12. [Errores y códigos HTTP](#12-errores-y-códigos-http)
13. [Seguridad y despliegue](#13-seguridad-y-despliegue)
14. [Patrones de despliegue](#14-patrones-de-despliegue)
15. [Extender CORS y configuración avanzada](#15-extender-cors-y-configuración-avanzada)
16. [Resolución de problemas](#16-resolución-de-problemas)
17. [CLI consola (`adf` / `agent-daemon-tty`)](#17-cli-consola-adf--agent-daemon-tty)
18. [Apéndice: cliente mínimo en TypeScript](#18-apéndice-cliente-mínimo-en-typescript)

---

## 1. Qué es el daemon y qué problema resuelve

El **daemon** es un proceso Node.js que:

- Expone **HTTP** en un host/puerto configurables (por defecto `127.0.0.1:8787`).
- Ofrece un catálogo de **motores** (engines): demos locales y, si existen en el
  `PATH`, CLIs como Claude Code, Codex, Cursor `agent`, OpenCode, Pi, Qwen.
- Para cada petición de chat, puede **lanzar subprocesos** o ejecutar lógica
  interna y **retransmitir** el resultado como **Server-Sent Events (SSE)** con
  eventos JSON normalizados.

**Problema que resuelve:** tu producto (SaaS, IDE plugin, orquestador) no tiene
que implementar el protocolo de cada CLI ni gestionar señales, timeouts y
streams; habla **solo HTTP + JSON + SSE** con un proceso que corre **junto al
usuario** (misma máquina o misma red de confianza).

---

## 2. Arquitectura recomendada

```
┌─────────────────────────────────────────────────────────────┐
│  Tu producto (cloud / SaaS)                                  │
│  — no ejecuta CLIs del usuario directamente                 │
└──────────────────────────────┬──────────────────────────────┘
                               │  Opcional: cola, auth, billing
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Máquina del usuario                                          │
│  ┌──────────────┐      HTTP/SSE      ┌─────────────────────┐ │
│  │ Tu UI local   │ ◄──────────────► │  agent-daemon        │ │
│  │ o agente local│                    │  (este repo)         │ │
│  └──────────────┘                    └──────────┬──────────┘ │
│                                                 │ spawn       │
│                                                 ▼             │
│                                        claude / codex / …     │
└─────────────────────────────────────────────────────────────┘
```

**Regla práctica:** el daemon debe ser alcanzable **solo desde donde tenga
sentido ejecutar código local** (localhost o red privada). No lo expongas a
Internet sin capas de autenticación y TLS.

---

## 3. Requisitos previos

| Requisito | Detalle |
|-----------|---------|
| Node.js | **20+** recomendado (alineado con el monorepo). |
| Red | El cliente debe poder abrir **TCP** hacia `AGENT_DAEMON_HOST:AGENT_DAEMON_PORT`. |
| CLIs (opcional) | Si usas motores reales, los binarios deben estar en el `PATH` y autenticados (API keys, OAuth, etc.) en la máquina del usuario. |
| CORS (solo browser) | El daemon trae una lista fija de orígenes CORS; para otros orígenes usa **proxy reverso** o amplía la lista (ver [§15](#15-extender-cors-y-configuración-avanzada)). |

---

## 4. Paso 1: Obtener y arrancar el daemon

### 4.1. Ubicación en el repositorio

El código del daemon vive en:

`agent-deamon-framework/daemon/`

### 4.2. Instalación de dependencias

Desde la raíz del monorepo `agent-deamon-framework`:

```bash
cd agent-deamon-framework
npm install
```

### 4.3. Variables de entorno

| Variable | Obligatoria | Default | Descripción |
|----------|-------------|---------|-------------|
| `AGENT_DAEMON_HOST` | No | `127.0.0.1` | Interfaz de escucha. Mantén loopback salvo que sepas por qué abrir más. |
| `AGENT_DAEMON_PORT` | No | `8787` | Puerto HTTP. |
| `AGENT_DAEMON_TIMEOUT_MS` | No | `1200000` (20 min) | Tiempo máximo por turno de chat (subprocesos). |
| `AGENT_DAEMON_CWD` | No | `process.cwd()` del proceso | Directorio de trabajo para subprocesos (repositorio del usuario). |

Ejemplo:

```bash
export AGENT_DAEMON_PORT=8787
export AGENT_DAEMON_CWD="$HOME/proyectos/mi-repo"
```

### 4.4. Arranque en desarrollo

Desde la raíz del monorepo (recomendado):

```bash
cd agent-deamon-framework
adf run daemon
```

Equivalente con npm en el workspace:

```bash
cd agent-deamon-framework
npm run dev -w daemon
```

O solo el paquete daemon:

```bash
cd agent-deamon-framework/daemon
npm run dev
```

Deberías ver un log similar a:

`agent-daemon listening on http://127.0.0.1:8787`

### 4.5. Arranque en producción (referencia)

Tras compilar (`npm run build -w daemon` si tienes script `tsc` emitiendo
`dist/`), ejecuta el punto de entrada con Node. En este MVP el flujo habitual es
**tsx** o **node** sobre el código transpilado; ajusta según tu pipeline.

---

## 5. Paso 2: Comprobar conectividad

### 5.1. Health check

```bash
curl -sS "http://127.0.0.1:8787/api/health"
```

Respuesta esperada: `{"ok":true}`

### 5.2. Listado de motores

```bash
curl -sS "http://127.0.0.1:8787/api/engines" | jq .
```

Comprueba que el JSON incluye `engines[]` con `id`, `label`, `description` y
`available`.

### 5.3. Chat de prueba (SSE)

```bash
ENGINE="$(curl -sS "http://127.0.0.1:8787/api/engines" | jq -r '[.engines[] | select(.available==true)][0].id')"
curl -sS -N -X POST "http://127.0.0.1:8787/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"engineId\":\"${ENGINE}\",\"message\":\"hola\"}"
```

Debes ver líneas `data: {...}` en formato SSE (ver [§7](#7-contrato-sse-eventos-de-streaming)).

El script `agent-deamon-framework/scripts/smoke.sh` automatiza parte de esto.

---

## 6. Contrato HTTP: referencia de API

Base URL: `http://{AGENT_DAEMON_HOST}:{AGENT_DAEMON_PORT}`

Todas las rutas documentadas van bajo el prefijo **`/api`**.

### 6.1. `GET /api/health`

- **Propósito:** comprobar que el proceso responde.
- **Cuerpo:** JSON `{ "ok": true }`
- **Códigos:** `200`

### 6.2. `GET /api/engines`

- **Propósito:** catálogo de motores para poblar selectores o políticas de
  enrutamiento.
- **Cuerpo:** JSON

```json
{
  "engines": [
    {
      "id": "claude",
      "label": "Claude Code",
      "description": "Local `claude` CLI (stream-json).",
      "available": false,
      "integration": {
        "argvJsonEnvKey": "AGENT_ENGINE_CLAUDE_ARGS_JSON",
        "engineIdEnvSuffix": "CLAUDE"
      }
    }
  ]
}
```

Cada motor incluye `integration` con la variable `argvJsonEnvKey` y el sufijo
codificado (`engineIdEnvSuffix`); véase §10.1.

- **Códigos:** `200`

### 6.2.1. `GET /api/engine-models`

- **Propósito:** catálogo de **modelos sugeridos** por motor (salida de CLIs como
  `agent --list-models`, `opencode models`, `pi --list-models`, o listas
  estáticas cuando no hay comando).
- **Cuerpo:** JSON `{ "engines": [ { "engineId", "available", "source",
  "models": [{ "id", "label?" }], "error?", "note?" } ] }`.
- **Códigos:** `200`  
  Los sondeos pueden tardar hasta `AGENT_DAEMON_LIST_MODELS_TIMEOUT_MS`
  (default 45s) por proceso.

### 6.3. `POST /api/chat`

- **Propósito:** un turno de conversación: un mensaje de usuario → stream de
  eventos hasta término.
- **Cabeceras:** `Content-Type: application/json`
- **Cuerpo (JSON):**

| Campo | Tipo | Restricciones |
|-------|------|----------------|
| `engineId` | string | `1…64` caracteres, debe existir en el catálogo. |
| `message` | string | `1…200000` caracteres. |
| `engineOptions` | objeto (opc.) | Vocabulario **único** y **estricto** (sin claves desconocidas) para el subproceso. |
| `model` | string (opc., legacy) | Igual que `engineOptions.model` si esta no viene. |

Campos permitidos en **`engineOptions`** (todos opcionales):

| Campo | Uso típico |
|-------|------------|
| `model` | `--model` / equivalente en el motor. |
| `cwd` | Directorio de trabajo del subproceso; debe quedar **bajo** `AGENT_DAEMON_CWD`. |
| `addDirs` | Lista de rutas extra; Claude → `--add-dir` (cada una bajo el cwd del daemon). |
| `permissionMode` | Claude → `--permission-mode` (`acceptEdits`, `auto`, `bypassPermissions`, …). |
| `approvalMode` | Qwen → `--approval-mode` (`plan`, `default`, `auto-edit`, `yolo`). |
| `executionMode` | Cursor `agent` → `--mode` (`plan`, `ask`). |
| `resume` | `boolean` o `string` (motor: `--resume` / `-r` / `--continue` según adaptador). |
| `sessionId` | Identificador de sesión (p. ej. Claude `--session-id`, OpenCode `-s`). |
| `thinking` | Pi → `--thinking` (`off` … `xhigh`). |
| `variant` | OpenCode → `--variant`. |
| `streamPartialOutput` | Cursor: `false` omite `--stream-partial-output`. |
| `continueSession` | Continuar sesión (`-c` / `--continue` según motor). |
| `forkSession` | Claude → `--fork-session`. |

- **Respuesta exitosa:** `200` con cuerpo **`text/event-stream`** (SSE).
- **Errores (JSON, no SSE):**

| Código | Cuándo |
|--------|--------|
| `400` | JSON inválido, validación Zod fallida, o motor **existente** pero `available: false`. |
| `404` | `engineId` desconocido. |

Ejemplo de cuerpo de error:

```json
{ "error": "Unknown engine: foo" }
```

o, con validación:

```json
{ "error": { "fieldErrors": { … }, "formErrors": [] } }
```

---

## 7. Contrato SSE: eventos de streaming

Cada evento SSE lleva en `data` un **único objeto JSON** (una línea), sin
campos adicionales fuera del JSON.

### 7.1. Tipos de evento

| `type` | Campos | Significado |
|--------|--------|-------------|
| `delta` | `text: string` | Fragmento de salida del asistente (acumulable en el cliente). |
| `log` | `stream: "stdout" \| "stderr"`, `message: string` | Trazas de depuración o stderr del subproceso. |
| `error` | `message: string` | Fallo recuperable o de negocio; el cliente debe mostrarlo y **dar por terminado** el turno salvo que también llegue `done` (ver nota). |
| `done` | — | Turno completado con éxito relativo al motor (sin excepción no capturada). |

**Nota de terminación:** en errores fatales del motor puede emitirse `error`
sin `done`. Tu cliente debe considerar **`error` como estado terminal** y
opcionalmente esperar cierre del stream. Si el motor termina bien, suele llegar
`done`.

### 7.2. Formato bruto SSE

Ejemplo (simplificado):

```
data: {"type":"delta","text":"Hola"}

data: {"type":"done"}

```

Los bloques van separados por **doble salto de línea** (`\n\n`). Parsea
líneas que empiecen por `data: `.

---

## 8. Paso 3: Integrar desde un backend (Node, Python, Go, etc.)

### 8.1. Flujo recomendado

1. **Descubrimiento:** `GET /api/engines` al iniciar sesión o al configurar el
   workspace del usuario.
2. **Selección:** guarda `engineId` elegido (preferiblemente solo si
   `available === true`).
3. **Ejecución:** `POST /api/chat` con `fetch`, `httpx`, `http.Client`, etc.
4. **Consumo:** lee el cuerpo como stream de bytes, acumula buffer, parte por
   `\n\n`, parsea JSON tras `data: `.

### 8.2. Node.js (fetch + ReadableStream)

```javascript
const res = await fetch("http://127.0.0.1:8787/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ engineId: "claude", message: "hola" }),
});

if (!res.ok) {
  const err = await res.json();
  throw new Error(JSON.stringify(err));
}

const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = "";
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  // Aquí: extraer bloques SSE de `buf` (ver apéndice §17).
}
```

### 8.3. Python (requests con stream)

Usa `stream=True` y lee línea a línea; detecta `data: ` y `json.loads`.

### 8.4. Go

Usa `http.Post` con `Body` como `io.Reader`; lee el body con un scanner o
buffer y aplica el mismo parser SSE.

### 8.5. Conexión desde tu “cloud”

Si tu backend en la nube necesita orquestar al usuario, **no** llames al
`127.0.0.1` del servidor cloud: ahí no existe el daemon del usuario. Necesitas
uno de:

- **Agente local** que tu app instale y que se registre contra tu API con un
  túnel o websocket (fuera del alcance de este MVP).
- **VPN / red privada** donde el daemon del usuario tenga IP alcanzable por
  tu componente de confianza.

---

## 9. Paso 4: Integrar desde una aplicación web (browser)

### 9.1. Misma máquina, mismo origen (recomendado)

Evita CORS sirviendo tu SPA y proxificando `/api` al daemon. Ejemplo ya
incluido en Vite (`web/vite.config.ts`):

```ts
proxy: { "/api": { target: "http://127.0.0.1:8787", changeOrigin: true } }
```

En el navegador usas rutas relativas:

```ts
await fetch("/api/engines");
await fetch("/api/chat", { method: "POST", … });
```

### 9.2. Origen distinto (otro puerto o dominio)

El daemon solo permite CORS explícito para `localhost:5173` y
`127.0.0.1:5173` en el código actual. Opciones:

1. **Proxy** en tu servidor de desarrollo o gateway (preferido).
2. **Ampliar** la lista en `daemon/src/index.ts` (`cors({ origin: [...] })`).

### 9.3. AbortController

Pasa `signal` a `fetch` para cancelar la petición cuando el usuario pulse
“Stop”; el daemon aborta el trabajo asociado al request cuando el runtime lo
propaga al motor.

---

## 10. Motores (`engineId`) y disponibilidad

| `id` | Comportamiento típico |
|------|------------------------|
| `claude`, `codex`, `cursor_agent`, `opencode`, `pi`, `qwen` | Subproceso si el binario existe en `PATH`. |

**Integración robusta:**

1. No hardcodees “siempre hay Claude”; usa `GET /api/engines`.
2. Deshabilita UI si `available === false`.
3. Maneja `400` por motor no disponible si el catálogo cambia entre el `GET` y
   el `POST`.

### 10.1. Flags extra (`AGENT_ENGINE_*_ARGS_JSON`)

Sin recompilar el daemon puedes añadir **argumentos de línea de comandos**
(flags como `--model`, `--foo`, valores sueltos que el CLI espere después de
un flag, etc.) al subproceso de un motor concreto:

| Pieza | Significado |
|-------|-------------|
| Sufijo `<ENGINEID>` | El `id` del motor en **mayúsculas**; caracteres no alfanuméricos → `_` (ej. `cursor_agent` → `CURSOR_AGENT`). |
| `AGENT_ENGINE_<SUFFIX>_ARGS_JSON` | JSON **array de strings** fusionado en el `argv` del CLI en el orden documentado en el adaptador (`daemon/src/engines/adaptadores/*.ts`). |

**Precedencia:** el adaptador monta primero su `argv` por defecto y luego
inserta los tokens de `ARGS_JSON` en la posición documentada (antes del prompt
en argv, antes de `-` en stdin, etc.). El hijo **sigue heredando** `process.env`
del proceso daemon; no hay variables `*_ENV_JSON` ni merge extra de entorno
desde esta función.

**Límites y errores:** tamaño del JSON, número de tokens y longitud por token
están acotados en `daemon/src/engines/engine-env.ts` (`ENGINE_ARGV_LIMITS`). Si
el JSON es inválido, no es un array de strings, o un token contiene salto de
línea, se **ignoran** los extras (aviso en consola del daemon) y se usa solo el
argv por defecto.

**Descubrimiento HTTP:** `GET /api/engines` devuelve `integration.argvJsonEnvKey`
e `integration.engineIdEnvSuffix`. El vocabulario de cada CLI sigue en los
comentarios del adaptador / `--help` del binario.

---

## 11. Cancelación, timeouts y ciclo de vida

| Tema | Comportamiento |
|------|----------------|
| **Timeout** | `AGENT_DAEMON_TIMEOUT_MS` por turno. |
| **Cancelación HTTP** | Abortar el `fetch` corta el request; el motor recibe `AbortSignal`. |
| **Subprocesos** | Reciben SIGTERM y luego SIGKILL en timeout (implementación en `spawn-helpers`). |

Tu producto debe:

- Mostrar progreso mientras el stream está abierto.
- Liberar UI al cerrar el stream o al recibir `error` / `done`.

---

## 12. Errores y códigos HTTP

| Situación | HTTP | Cuerpo |
|-----------|------|--------|
| Motor desconocido | `404` | `{ "error": "Unknown engine: …" }` |
| Motor marcado no disponible | `400` | `{ "error": "Engine unavailable: …" }` |
| JSON inválido | `400` | `{ "error": "Invalid JSON body" }` |
| Validación | `400` | `{ "error": <Zod flatten> }` |
| Error en motor durante SSE | `200` | evento SSE `type: "error"` |

Distingue **errores de transporte** (red) de **errores de aplicación** (JSON en
4xx vs SSE `error`).

---

## 13. Seguridad y despliegue

1. **Bind:** por defecto `127.0.0.1` — limita acceso a procesos locales.
2. **Sin autenticación en el MVP:** cualquier proceso local que alcance el
   puerto puede invocar chat. En producto, añade:
   - token compartido en cabecera (validación en middleware Hono),
   - o socket Unix + permisos,
   - o mTLS.
3. **No ejecutes el daemon como root** salvo que sea imprescindible.
4. **Mensajes (`message`)** pueden contener inyección hacia el CLI; trata el
   daemon como **capa privilegiada** que ejecuta código en la máquina del
   usuario y valida políticas en tu producto antes de enviar.

---

## 14. Patrones de despliegue

| Patrón | Descripción |
|--------|-------------|
| **Sidecar local** | Tu app de escritorio o script arranca el daemon junto a la UI. |
| **Servicio de usuario** | Instalador registra un `launchd` / systemd user unit que levanta el daemon al login. |
| **Solo desarrollo** | Vite + proxy, como en `web/`. |
| **Contenedor** | Monta `AGENT_DAEMON_CWD` como volumen del repo del usuario; expón solo loopback al host. |

---

## 15. Extender CORS y configuración avanzada

Hoy la lista CORS está en `daemon/src/index.ts`:

```ts
cors({
  origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
})
```

Para un origen nuevo:

1. Añade la URL exacta (esquema + host + puerto).
2. O sustituye por una función que lea `process.env.AGENT_DAEMON_CORS_ORIGINS`
   (mejora futura recomendada).

---

## 16. Resolución de problemas

| Síntoma | Qué revisar |
|---------|-------------|
| `ECONNREFUSED` | ¿Daemon arrancado? ¿Puerto correcto? |
| CORS en browser | Proxy mismo origen o ampliar CORS (§15). |
| `404` en chat | Typo en `engineId`; refresca catálogo con `GET /api/engines`. |
| `400` Engine unavailable | El binario no está en `PATH` o motor deshabilitado. |
| Solo `error` con `exit 1` | Revisa stderr del CLI (cuotas, auth); el parser SSE no sustituye al login del proveedor. |
| Chat muy lento | Timeout alto; revisa red o modelo del CLI. |

---

## 17. CLI consola (`adf` / `agent-daemon-tty`)

Paquete **`cli/`** del monorepo: cliente **solo HTTP** (misma API que la web).
No importa motores ni el código interno del daemon. El binario principal es
**`adf`**; **`agent-daemon-tty`** es un alias del mismo ejecutable (compatibilidad).

### 17.1. Instalación

Tras `npm install` en `agent-deamon-framework/`, los binarios quedan en
`node_modules/.bin/adf` y `node_modules/.bin/agent-daemon-tty`.

Instalación **global** desde el clon (compila `cli/` y ejecuta
`npm install -g ./cli`):

```bash
npm run install:cli
```

Para que `adf run daemon` y `adf run web` encuentren el monorepo, la CLI resuelve
la raíz (carpetas `daemon/` y `web/`) en este orden: variable de entorno
**`ADF_FRAMEWORK_ROOT`**, subida desde el directorio actual de trabajo, subida
desde la ruta del ejecutable instalado. Si usas `-g` y trabajas fuera del clon,
define `ADF_FRAMEWORK_ROOT` con la ruta absoluta al repositorio. Ver README y
`docs/USER_GUIDE.md`.

### 17.2. Comandos (`adf`)

| Comando | Descripción |
|---------|-------------|
| `adf run daemon` | Arranca el daemon en **primer plano** (logs en consola; `npm run dev` del workspace `daemon`). |
| `adf run web` | Arranca la demo web (Vite) en primer plano. |
| `adf stop` | Detiene procesos que escuchan en `AGENT_DAEMON_PORT` y `ADF_WEB_PORT` (por defecto 8787 y 5173): SIGTERM y, si siguen vivos, SIGKILL. |
| `adf chat` | Solo REPL; exige daemon ya escuchando. |

### 17.3. Comandos (`agent-daemon-tty`, alias)

| Comando | Descripción |
|---------|-------------|
| `agent-daemon-tty` o `… up` | Si `/api/health` falla, arranca el daemon en **segundo plano** (`npm run dev` en `daemon/`) y abre el chat. |
| `agent-daemon-tty chat` | Igual que `adf chat`. |
| `agent-daemon-tty serve` | Igual que `adf run daemon`. |

Opciones (válidas para `adf chat` y para `agent-daemon-tty`):

- `--url <base>` — base del daemon (por defecto `AGENT_DAEMON_URL` o
  `http://127.0.0.1:8787`).
- `--engine <id>` — motor inicial si está disponible.

El subproceso del daemon **hereda** `process.env` (incl. `AGENT_DAEMON_PORT`,
`AGENT_DAEMON_HOST`, `AGENT_DAEMON_CWD`).

### 17.4. Atajos dentro del REPL

| Entrada | Acción |
|---------|--------|
| `/engines`, `/refresh` | Vuelve a llamar `GET /api/engines`. |
| `/engine <id>` o `/use <id>` | Cambia el motor activo (solo si `available`). |
| `/quit` | Sale. |
| `?`, `/help` | Ayuda. |
| *otro texto* | `POST /api/chat` con streaming SSE a stdout. |
| **Ctrl+C** | Aborta la petición en curso. |

### 17.5. Desde npm en la raíz del monorepo

```bash
npx adf chat
```

---

## 18. Apéndice: cliente mínimo en TypeScript

Parser SSE incremental mínimo (mismo enfoque que la demo `web/`):

```typescript
type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "log"; stream: "stdout" | "stderr"; message: string }
  | { type: "done" }
  | { type: "error"; message: string };

function parseSseBuffer(buf: string): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = [];
  const parts = buf.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const block of parts) {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      events.push(JSON.parse(raw) as StreamEvent);
    }
  }
  return { events, rest };
}

export async function chatStream(
  baseUrl: string,
  engineId: string,
  message: string,
  onEvent: (e: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ engineId, message }),
    signal,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(JSON.stringify(j));
  }
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let carry = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    carry += dec.decode(value, { stream: true });
    const { events, rest } = parseSseBuffer(carry);
    carry = rest;
    for (const ev of events) onEvent(ev);
  }
}
```

Uso:

```typescript
await chatStream(
  "http://127.0.0.1:8787",
  "claude",
  "hola",
  (ev) => console.log(ev),
  AbortSignal.timeout(30_000),
);
```

---

## Resumen ejecutivo

1. Arranca el daemon y valida `GET /api/health` y `GET /api/engines`.
2. Elige `engineId` con `available: true`.
3. Llama `POST /api/chat` con JSON; lee **SSE** hasta `done` o `error`.
4. En browser, **proxifica** `/api` o amplía CORS.
5. Trata el daemon como **superficie sensible**: loopback, auth y políticas
   son responsabilidad de tu producto en entornos reales.

Para la demo visual y proxy de referencia, revisa el paquete `web/`; para TTY,
el paquete `cli/` del mismo monorepo.
