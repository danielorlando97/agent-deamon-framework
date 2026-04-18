# Documentación del proyecto

Índice de toda la documentación de **agent-deamon-framework**: guías para
quien solo quiere usarlo y material técnico para quien lo amplía o integra.

---

## Para usuarios

| Documento | Contenido |
|-----------|-----------|
| **[Inicio rápido](QUICKSTART.md)** | Instalar, `adf` local o global (`npm run install:cli`), smoke, puertos y motores (`engineId`). |
| **[Guía de usuario](USER_GUIDE.md)** | Qué es el producto, instalación, web, CLI, motores, `ADF_FRAMEWORK_ROOT`, FAQ. |

---

## Para desarrolladores e integradores

| Documento | Contenido |
|-----------|-----------|
| **[Documentación técnica](TECHNICAL.md)** | Arquitectura del monorepo, paquetes, flujos de datos, puntos de extensión, variables, límites del MVP. |
| **[Integración en otros productos](INTEGRATION.md)** | Contrato HTTP/SSE paso a paso, backends, navegador, seguridad, despliegue, CLI `adf`, cliente TypeScript de ejemplo. |

---

## Resumen en una frase

Un **daemon HTTP local** expone motores (CLIs y demos); la **web** y la **CLI**
son clientes que solo hablan con ese API — no ejecutan motores por su cuenta.

---

## Estructura del repositorio (referencia rápida)

```
agent-deamon-framework/
├── daemon/          # Servidor Hono + motores + SSE
├── web/             # Vite + React (demo UI)
├── cli/             # adf + agent-daemon-tty (chat por HTTP)
├── docs/            # Esta carpeta (QUICKSTART, guías, integración)
├── openspec/        # Cambio OpenSpec (proposal, specs, tasks)
├── scripts/         # smoke.sh, install-cli.sh
├── package.json     # workspaces npm
└── README.md        # Inicio rápido (inglés)
```

Para arranque inmediato: **[QUICKSTART.md](QUICKSTART.md)** (ES) o
**[README.md](../README.md)** (inglés) en la raíz del monorepo.
