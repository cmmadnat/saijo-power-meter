#!/usr/bin/env bash
#
# Cloud sessions start from a fresh container, so anything installed last time is
# gone. This makes the session able to typecheck and diff the Pulumi program.
# It deliberately installs no cloud credentials: applying infrastructure is the
# CI job's business (see .github/workflows/infra.yml).

set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! command -v pulumi >/dev/null 2>&1; then
  echo "Installing Pulumi CLI..."
  if curl -fsSL https://get.pulumi.com | sh >/dev/null 2>&1; then
    # Symlink rather than edit PATH: each Bash call gets a fresh shell.
    for bin in "$HOME"/.pulumi/bin/*; do
      [ -x "$bin" ] && ln -sf "$bin" "/usr/local/bin/$(basename "$bin")" 2>/dev/null
    done
    echo "Pulumi $(pulumi version 2>/dev/null) installed."
  else
    echo "Pulumi CLI install failed; 'pulumi' commands will be unavailable."
  fi
fi

if [ -f "$repo/infra/package-lock.json" ] && [ ! -d "$repo/infra/node_modules" ]; then
  echo "Installing infra dependencies..."
  (cd "$repo/infra" && npm ci --prefer-offline --no-audit --fund=false >/dev/null 2>&1) \
    && echo "infra dependencies ready." \
    || echo "npm ci failed in infra/; run it manually before typechecking."
fi

exit 0
