#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_ENV_FILE="$(cd "$WORKER_DIR/../.." && pwd)/.env.local"

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
  echo "No command provided to run-with-infisical.sh" >&2
  exit 1
fi

TEMP_VARS_FILE="$(mktemp)"
cleanup() {
  rm -f "$TEMP_VARS_FILE"
}
trap cleanup EXIT

if [[ -f "$ROOT_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_ENV_FILE"
  set +a
fi

if [[ -z "${INFISICAL_CLIENT_ID:-}" || -z "${INFISICAL_CLIENT_SECRET:-}" ]]; then
  echo "INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET must be set. Put them in $ROOT_ENV_FILE or export them in your shell." >&2
  exit 1
fi

if [[ -z "${INFISICAL_PROJECT_ID:-}" ]]; then
  echo "INFISICAL_PROJECT_ID must be set. Put it in $ROOT_ENV_FILE or export it in your shell." >&2
  exit 1
fi

export INFISICAL_TOKEN
INFISICAL_TOKEN="$(infisical login --silent --method=universal-auth --client-id="$INFISICAL_CLIENT_ID" --client-secret="$INFISICAL_CLIENT_SECRET" --plain)"
infisical export --token="$INFISICAL_TOKEN" --projectId="$INFISICAL_PROJECT_ID" --env="$ENV_NAME" --format=dotenv-export --silent > "$TEMP_VARS_FILE"

set -a
# shellcheck disable=SC1090
source "$TEMP_VARS_FILE"
set +a

cd "$WORKER_DIR"
bun x tsx scripts/generate-wrangler-config.ts --env "$ENV_NAME" --d1-mode "$D1_MODE"
exec "$@"
