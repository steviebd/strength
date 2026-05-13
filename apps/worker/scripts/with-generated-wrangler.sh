#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_NAME="dev"
D1_MODE="local"

while (($# > 0)); do
  case "$1" in
    --env)
      ENV_NAME="${2:-}"
      shift 2
      ;;
    --d1-mode)
      D1_MODE="${2:-}"
      shift 2
      ;;
    --)
      shift
      break
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if (($# == 0)); then
  echo "No command provided to with-generated-wrangler.sh" >&2
  exit 1
fi

ensure_supported_node() {
  NODE_VERSION="$(node -v 2>/dev/null || true)"
  NODE_MAJOR="${NODE_VERSION#v}"
  NODE_MAJOR="${NODE_MAJOR%%.*}"

  if [[ -n "$NODE_MAJOR" && "$NODE_MAJOR" -ge 22 ]]; then
    return
  fi

  for NODE_DIR in /opt/homebrew/opt/node@24/bin /opt/homebrew/opt/node@22/bin; do
    if [[ -x "$NODE_DIR/node" ]]; then
      export PATH="$NODE_DIR:$PATH"
      NODE_VERSION="$(node -v 2>/dev/null || true)"
      NODE_MAJOR="${NODE_VERSION#v}"
      NODE_MAJOR="${NODE_MAJOR%%.*}"
      if [[ -n "$NODE_MAJOR" && "$NODE_MAJOR" -ge 22 ]]; then
        return
      fi
    fi
  done
}

ensure_supported_node
if [[ -z "$NODE_MAJOR" || "$NODE_MAJOR" -lt 22 ]]; then
  echo "Node.js 22+ is required for Wrangler commands. Current version: ${NODE_VERSION:-not found}" >&2
  echo "Switch to Node.js 22 or newer, then rerun the command." >&2
  exit 1
fi

cd "$WORKER_DIR"
bun x tsx scripts/generate-wrangler-config.ts --env "$ENV_NAME" --d1-mode "$D1_MODE"
export PATH="$WORKER_DIR/../../node_modules/.bin:$WORKER_DIR/node_modules/.bin:$PATH"
exec "$@"
