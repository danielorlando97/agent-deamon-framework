# Contributing

Thanks for helping improve Agent Daemon Framework. This document covers local
setup, checks you can run before opening a PR, and how we expect changes to be
described.

## Prerequisites

- **Node.js 20+** (`node -v`).
- **npm** (bundled with Node).

## Clone and install

```bash
git clone https://github.com/danielorlando97/agent-deamon-framework.git
cd agent-deamon-framework
npm install
```

Build all workspaces:

```bash
npm run build
```

## Development workflow

| Goal | Command |
|------|---------|
| HTTP daemon (watch) | `npm run dev -w daemon` or `adf run daemon` from repo root |
| Web UI (Vite) | `npm run dev -w web` or `adf run web` |
| CLI only needs a running daemon | `adf chat` |

Run daemon tests:

```bash
npm test -w daemon
```

Smoke test (daemon must be listening on the configured port; needs `jq`):

```bash
npm run smoke
```

## CLI from this repo

Without a global install, use `npx adf` from the repository root after
`npm install`. To install `adf` on your PATH from the clone:

```bash
npm run install:cli
# or: bash scripts/install-cli.sh
```

See [README.md](README.md) and [docs/QUICKSTART.md](docs/QUICKSTART.md).

## Pull requests

1. **Scope:** Keep changes focused on one concern when possible.
2. **Tests:** Add or update tests when behavior changes in `daemon/`.
3. **Docs:** Update user-facing docs (`docs/`, root `README.md`) if commands,
   env vars, or behavior visible to integrators changes.
4. **Commits:** Prefer [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat:`, `fix:`, `docs:`, etc.) so history stays readable.

## Security

For sensitive issues, avoid public issues until coordinated; use your
organization’s usual security contact if applicable.

## License

By contributing, you agree that your contributions are licensed under the same
terms as the project ([LICENSE](LICENSE)).
