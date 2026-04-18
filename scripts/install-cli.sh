#!/usr/bin/env bash
# Install the adf CLI globally from a local clone (npm install -g ./cli).
# Requires: Node.js 20+, run from repo root or any cwd (script resolves root).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "Building CLI…"
npm run build -w cli
echo "Installing globally (may require sudo on Unix depending on npm prefix)…"
npm install -g ./cli
echo "Done. Verify: adf --help"
