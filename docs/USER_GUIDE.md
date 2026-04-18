# Guía de usuario — Agent daemon framework

Esta guía está pensada para **quien quiere usar** el proyecto en su máquina:
interfaz web, chat en terminal o comprobaciones rápidas. No hace falta leer
código.

---

## 1. ¿Qué es esto?

Es un **programa local** (el *daemon*) que:

- Escucha en tu ordenador (por defecto `http://127.0.0.1:8787`).
- Ofrece una lista de **motores** (engines): unos de demostración y otros que
  ejecutan herramientas de línea de órdenes que ya tengas instaladas (Claude
  Code, Codex, etc.), **si están en el PATH** y configuradas.
- Cuando envías un mensaje, el daemon **orquesta** el motor elegido y te
  devuelve la respuesta **en streaming** (trozo a trozo), igual en la web que
  en la terminal.

**Importante:** no sustituye a las cuentas ni licencias de cada herramienta. Si
Codex u otro motor dice que no hay cuota o falta autenticación, eso depende del
proveedor, no de este proyecto.

---

## 2. Requisitos

- **Node.js 20 o superior** ([nodejs.org](https://nodejs.org)).
- Terminal (macOS, Linux o WSL en Windows).
- Opcional: **navegador** moderno para la demo web.

---

## 3. Instalación (una sola vez por carpeta)

1. Abre una terminal.
2. Ve al directorio del proyecto:

   ```bash
   cd ruta/al/agent-deamon-framework
   ```

3. Instala dependencias:

   ```bash
   npm install
   ```

Si esto falla, comprueba la versión de Node (`node -v`).

### 3.1 Comando `adf` en el PATH (opcional)

Después de `npm install` puedes instalar la CLI globalmente **desde el propio
clon** (no hace falta publicar el paquete en npm):

```bash
npm run install:cli
```

Así podrás escribir **`adf`** en cualquier terminal. Para que encuentre el
monorepo al usar `adf run daemon` / `adf run web`, haz **una** de estas cosas:

- Ejecutar `adf` con el directorio actual **dentro del clon** (subcarpetas
  valen; se busca hacia arriba hasta la raíz con `daemon/` y `web/`).
- O exportar la ruta a la raíz del repositorio:

  ```bash
  export ADF_FRAMEWORK_ROOT=/ruta/absoluta/al/agent-deamon-framework
  ```

Para quitar la instalación global:

```bash
npm run unlink:cli
```

Detalle en inglés en el [README.md](../README.md) de la raíz.

---

## 4. Arrancar la interfaz web (recomendado para empezar)

En la misma carpeta del proyecto abre **dos** terminales:

**Terminal 1 — daemon (API):**

```bash
adf run daemon
```

**Terminal 2 — web (Vite):**

```bash
adf run web
```

Servicios habituales:

| Qué | Dirección habitual |
|-----|---------------------|
| **Web** (chat visual) | [http://localhost:5173](http://localhost:5173) |
| **Daemon** (API) | `http://127.0.0.1:8787` (la web hace proxy de `/api` al mismo host/puerto que uses en `AGENT_DAEMON_*`) |

Abre el enlace de la web en el navegador. Verás:

- Un **panel de motores** a la izquierda: los que tienen estado “ready” se
  pueden usar; “absent” o deshabilitados no.
- Un **área de chat** y abajo un campo para escribir y enviar.

**Consejo:** usa `localhost` en el navegador tal como indica Vite; evita
mezclar `127.0.0.1` y `localhost` si ves avisos de cookies o CORS en otros
montajes.

Para **parar** cada servicio: en su terminal, pulsa `Ctrl+C`.

---

## 5. Arrancar solo el chat en terminal (CLI)

La CLI principal se llama **`adf`** (y el binario legacy **`agent-daemon-tty`**
apunta al mismo programa). Habla **solo** con el daemon por red (la misma API
que la web). Primero el daemon debe estar en marcha (por ejemplo con
`adf run daemon`).

### 5.1. Si ya tienes el daemon corriendo

```bash
adf chat
```

Verás un banner y un prompt `>`. Escribe tu mensaje y pulsa **Enter**.

### 5.2. Si quieres que el binario legacy levante el daemon solo

```bash
npx agent-daemon-tty
```

Si no hay respuesta en el puerto configurado, intentará arrancar el daemon en
segundo plano y luego abrir el chat. Con **`adf`** usa `adf run daemon` en otra
terminal y luego `adf chat`.

### 5.3. Ver solo los logs del daemon (avanzado)

```bash
adf run daemon
```

Aquí el daemon ocupa la terminal; abre **otra** terminal para `adf chat` si
quieres probar los dos a la vez.

### 5.4. Comandos dentro de la CLI

| Escribes… | Efecto |
|-----------|--------|
| `/engines` o `/refresh` | Vuelve a cargar la lista de motores. |
| `/engine <id>` (o `/use <id>`) | Cambia al motor indicado (si está disponible). |
| `/quit` o `/q` | Sale de la CLI. |
| `?` o `/help` | Muestra ayuda corta. |
| **Ctrl+C** | Interrumpe la respuesta que se está generando. |

---

## 6. Motores (engines): qué significa cada uno

En la lista verás identificadores (`id`). Lista completa y orden del registro:
[QUICKSTART.md §4 — Motores](QUICKSTART.md#4-motores-engineid). Resumen:

| Motor | Para qué sirve |
|-------|----------------|
| **claude**, **codex**, **cursor_agent**, **opencode**, **pi**, **qwen** | Solo aparecen como listos si el comando existe en tu sistema (`command -v`). Requieren que **tú** hayas hecho login o configuración según cada herramienta. |

Si un motor aparece como no disponible, instala o configura esa herramienta y
reinicia el daemon o pulsa refrescar en la web / `/refresh` en la CLI.

---

## 7. Variables de entorno (uso habitual)

Puedes definirlas **antes** de `adf run daemon`, `adf run web`, `adf chat`, etc.:

| Variable | Para qué |
|----------|----------|
| `AGENT_DAEMON_PORT` | Puerto del daemon (por defecto `8787`). |
| `AGENT_DAEMON_HOST` | Interfaz de escucha (por defecto `127.0.0.1`). |
| `AGENT_DAEMON_CWD` | Carpeta de trabajo donde los CLIs abren archivos (por defecto, donde arrancaste el proceso). |
| `AGENT_DAEMON_TIMEOUT_MS` | Tiempo máximo de una respuesta larga (motores reales). |
| `AGENT_DAEMON_URL` | URL base que usa la CLI (por defecto `http://127.0.0.1:8787`). |
| `ADF_FRAMEWORK_ROOT` | Raíz del monorepo (con `daemon/` y `web/`). Útil si instalaste `adf` con `npm install -g` y ejecutas comandos fuera del clon. |

Ejemplo: usar el puerto 8877 **tanto** al arrancar el daemon, el proxy de Vite
y la CLI:

```bash
export AGENT_DAEMON_PORT=8877
export AGENT_DAEMON_URL=http://127.0.0.1:8877
adf run daemon
# otra terminal: AGENT_DAEMON_PORT=8877 adf run web
# otra terminal: adf chat
```

---

## 8. Problemas frecuentes (FAQ)

**No carga la web o dice que no puede conectar con la API.**  
Comprueba que el daemon esté levantado y que el proxy de Vite apunte al mismo
puerto (`web/vite.config.ts`). Prueba en terminal:
`curl http://127.0.0.1:8787/api/health` — debería responder `{"ok":true}`.

**Todos los motores aparecen “Offline” / la CLI dice que el motor no está
disponible.**  
Ya no hay motores demo: hace falta tener **al menos un** CLI del listado
(`claude`, `codex`, etc.) en el `PATH`. Comprueba con `GET /api/engines` o
`/engines` en la CLI.

**Un motor “real” falla o dice límite de uso.**  
Eso viene del proveedor (OpenAI, Anthropic, etc.). Revisa cuentas, planes y
login del CLI correspondiente **fuera** de este proyecto.

**La CLI dice que no hay “carrier”.**  
El daemon no está escuchando. Arranca `adf run daemon` en otra terminal.

**Puerto en uso (`EADDRINUSE`).**  
Otro programa (u otra copia del daemon) usa ese puerto. Cambia `AGENT_DAEMON_PORT`
o cierra el otro proceso.

---

## 9. Seguridad (lectura rápida)

Por defecto el daemon escucha en **solo tu máquina** (loopback). No está
pensado para exponerlo a Internet sin autenticación fuerte, firewall y TLS. Trata
los mensajes que envías como **capaces de ejecutar acciones** en tu entorno si
el motor usa herramientas con acceso al disco.

---

## 10. Dónde seguir

- **Integrar** este daemon en tu propia aplicación: [INTEGRATION.md](INTEGRATION.md).
- **Arquitectura y código:** [TECHNICAL.md](TECHNICAL.md).
- **Inicio rápido en inglés:** [README.md](../README.md) en la raíz del monorepo.
