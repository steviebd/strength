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
  echo "No dev command provided to dev-with-optional-tunnel.sh" >&2
  exit 1
fi

TUNNEL_PID=""

cleanup() {
  if [[ -n "$TUNNEL_PID" ]]; then
    kill "$TUNNEL_PID" >/dev/null 2>&1 || true
    wait "$TUNNEL_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

if [[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" || -n "${CLOUDFLARE_TUNNEL_NAME:-}" || -n "${CLOUDFLARE_TUNNEL_HOSTNAME:-}" ]]; then
  if [[ -z "${CLOUDFLARE_TUNNEL_HOSTNAME:-}" ]]; then
    echo "Set CLOUDFLARE_TUNNEL_HOSTNAME to auto-start Cloudflare Tunnel." >&2
    exit 1
  fi

  if [[ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" && -z "${CLOUDFLARE_TUNNEL_NAME:-}" ]]; then
    echo "Set CLOUDFLARE_TUNNEL_TOKEN for a portable tunnel, or CLOUDFLARE_TUNNEL_NAME for a local named tunnel." >&2
    exit 1
  fi

  if ! command -v cloudflared >/dev/null 2>&1; then
    echo "cloudflared is required for Cloudflare Tunnel but was not found on PATH." >&2
    exit 1
  fi

  TUNNEL_HOSTNAME="${CLOUDFLARE_TUNNEL_HOSTNAME#https://}"
  TUNNEL_HOSTNAME="${TUNNEL_HOSTNAME#http://}"
  TUNNEL_HOSTNAME="${TUNNEL_HOSTNAME%%/*}"
  TUNNEL_ORIGIN="https://${TUNNEL_HOSTNAME}"

  if [[ "$TUNNEL_HOSTNAME" != *.* && "${WORKER_BASE_URL:-}" == https://*.* ]]; then
    TUNNEL_ORIGIN="${WORKER_BASE_URL%/}"
    echo "Using WORKER_BASE_URL for tunnel origin because CLOUDFLARE_TUNNEL_HOSTNAME is not fully qualified: ${TUNNEL_HOSTNAME}"
  fi

  export WORKER_BASE_URL="$TUNNEL_ORIGIN"

  if [[ -n "${BETTER_AUTH_TRUSTED_ORIGINS:-}" ]]; then
    export BETTER_AUTH_TRUSTED_ORIGINS="${BETTER_AUTH_TRUSTED_ORIGINS},${TUNNEL_ORIGIN}"
  else
    export BETTER_AUTH_TRUSTED_ORIGINS="$TUNNEL_ORIGIN"
  fi

  echo "Starting Cloudflare Tunnel for ${TUNNEL_ORIGIN} -> http://localhost:8787"
  if [[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
    cloudflared tunnel run --token "$CLOUDFLARE_TUNNEL_TOKEN" &
  else
    cloudflared tunnel run --url http://localhost:8787 "$CLOUDFLARE_TUNNEL_NAME" &
  fi
  TUNNEL_PID="$!"
fi

cd "$WORKER_DIR"
bash ./scripts/with-generated-wrangler.sh --env "$ENV_NAME" --d1-mode "$D1_MODE" -- "$@"
