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

cd "$WORKER_DIR"
bun x tsx scripts/generate-wrangler-config.ts --env "$ENV_NAME" --d1-mode "$D1_MODE"
exec "$@"
