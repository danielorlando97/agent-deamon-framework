# Inicio rápido (5 minutos)

Guía mínima para tener **daemon + web** o **solo chat en terminal** con el
monorepo `agent-deamon-framework`.

**Requisito:** Node.js **20+**.

---

## 1. Instalar

```bash
cd agent-deamon-framework
npm install
```

Tras esto, el comando **`adf`** está en `node_modules/.bin/` (usa `npx adf`
desde la raíz del clon, o `./node_modules/.bin/adf`).

### 1.1 Instalar `adf` en el sistema (opcional)

Para tener **`adf` en el PATH** desde este repositorio (después de `npm install`):

```bash
npm run install:cli
```

o:

```bash
bash scripts/install-cli.sh
```

Equivale a compilar `cli/` y ejecutar **`npm install -g ./cli`**. En una
instalación global, la CLI sigue necesitando localizar el monorepo para
`adf run daemon` y `adf run web`: ejecuta los comandos **dentro del clon**,
o define **`ADF_FRAMEWORK_ROOT`** con la ruta absoluta a la raíz del repo.

Desinstalar el paquete global:

```bash
npm run unlink:cli
```

Para añadir flags de CLI (`--model`, etc.) sin recompilar, revisa la sección
**10.1** en [INTEGRATION.md](INTEGRATION.md) (`AGENT_ENGINE_*_ARGS_JSON`).

---

## 2. Opción A — Interfaz web (recomendado)

Abre **dos** terminales en la raíz del repo:

| Terminal | Comando |
|----------|---------|
| 1 | `adf run daemon` |
| 2 | `adf run web` |

Luego abre en el navegador **http://localhost:5173** por defecto (Vite; puerto
con `ADF_WEB_PORT`). La web enruta `/api` al daemon usando
`AGENT_DAEMON_HOST` y `AGENT_DAEMON_PORT` (por defecto `127.0.0.1:8787`).

Para parar:

- **Desde otra terminal** (mismas variables de puerto que al arrancar):
  `adf stop` — envía señal a lo que escuche en el puerto del daemon y en el de
  la web (cualquier proceso en esos puertos, no solo este repo).
- O **`Ctrl+C`** en cada terminal donde corre `run daemon` / `run web`.

---

## 3. Opción B — Solo terminal (CLI)

1. Arranca el daemon (una terminal): `adf run daemon`
2. En otra terminal: `adf chat`

Comandos útiles dentro del chat: `/help`, `/engines`, `/engine <id>`, `/quit`.

Atajo legacy (levanta el daemon en segundo plano si hace falta, luego abre el
chat): `npx agent-daemon-tty`

---

## 4. Motores (`engineId`)

Cada petición de chat usa un **`engineId`**. Todos los motores dependen de un
binario en el `PATH`; solo aparecen como disponibles si `command -v` lo
encuentra. Lista canónica (orden del registro del daemon):

| `id` | Descripción breve |
|------|-------------------|
| `claude` | CLI `claude` (salida stream-json). |
| `codex` | `codex exec --json` (stdin). |
| `cursor_agent` | CLI `agent` de Cursor (stream-json). |
| `opencode` | `opencode run --format json`. |
| `pi` | `pi -p --mode json`. |
| `qwen` | `qwen` con `--output-format stream-json`. |

En caliente: `GET /api/engines` o en la CLI/web el listado y `/engines`.

---

## 5. Comprobar que responde (opcional)

Con el daemon en marcha:

```bash
npm run smoke
```

(o `curl http://127.0.0.1:8787/api/health` si usas el puerto por defecto).

---

## 6. Cambiar puerto (ejemplo)

Mismo valor para daemon, proxy de Vite y cliente:

```bash
export AGENT_DAEMON_PORT=8877
export AGENT_DAEMON_URL=http://127.0.0.1:8877
export ADF_WEB_PORT=5174
adf run daemon
# otra terminal: mismos export + adf run web
# otra terminal: adf chat
# parar: mismos export + adf stop
```

---

## Siguientes pasos

| Necesitas… | Documento |
|------------|------------|
| Más detalle de uso, motores y FAQ | [USER_GUIDE.md](USER_GUIDE.md) |
| API HTTP/SSE e integración | [INTEGRATION.md](INTEGRATION.md) |
| Arquitectura del repo | [TECHNICAL.md](TECHNICAL.md) |
| Resumen en inglés en la raíz | [README.md](../README.md) |
