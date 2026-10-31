#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

npm --prefix web ci --no-audit --no-fund
node web/build.cjs
node --test web/test/*.test.cjs
