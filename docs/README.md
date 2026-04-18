# Project documentation

Index of all **agent-deamon-framework** documentation: guides for end users and
technical material for those who extend or integrate the project.

---

## For users

| Document | Contents |
|----------|----------|
| **[Quick start](QUICKSTART.md)** | Install, local or global `adf` (`npm run install:cli`), smoke test, ports, engines (`engineId`). |
| **[User guide](USER_GUIDE.md)** | What the product is, installation, web UI, CLI, engines, `ADF_FRAMEWORK_ROOT`, FAQ. |

---

## For developers and integrators

| Document | Contents |
|----------|----------|
| **[Technical documentation](TECHNICAL.md)** | Monorepo architecture, packages, data flows, extension points, env vars, MVP limits. |
| **[Integration with other products](INTEGRATION.md)** | HTTP/SSE contract step by step, backends, browser, security, deployment, `adf` CLI, sample TypeScript client. |

---

## One-line summary

A **local HTTP daemon** exposes engines (CLIs and demos); the **web app** and
**CLI** are clients that only talk to that API—they never run engines on their
own.

---

## Repository layout (quick reference)

```
agent-deamon-framework/
├── daemon/          # Hono server + engines + SSE
├── web/             # Vite + React (demo UI)
├── cli/             # adf + agent-daemon-tty (HTTP chat)
├── docs/            # This folder (QUICKSTART, guides, integration)
├── openspec/        # OpenSpec change proposals (proposal, specs, tasks)
├── scripts/         # smoke.sh, install-cli.sh
├── package.json     # npm workspaces
└── README.md        # Quick start at monorepo root
```

For immediate startup: **[QUICKSTART.md](QUICKSTART.md)** or
**[README.md](../README.md)** at the monorepo root.
