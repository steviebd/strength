# strength

Greenfield Expo + Cloudflare Worker starter with:

- Expo Router
- Tailwind CSS via NativeWind
- Infisical for local secret injection
- Cloudflare Worker + D1
- Drizzle for database access
- Better Auth for development-only signup and login
- Bun workspaces

The Expo app is currently pinned to SDK 54 so it works with the Expo Go version available on the target Android device during development.

## What is implemented

- Email/password sign up and sign in in the Expo app
- Better Auth mounted on a Hono Worker
- D1-backed Better Auth tables defined in Drizzle
- Auth intentionally enabled only when `APP_ENV=development`
- No local `.env` file; worker config is generated from Infisical-injected runtime environment variables

## Secrets to create in Infisical

Store these in the `dev` environment for this project:

- `APP_ENV=development`
- `BETTER_AUTH_SECRET=<generate a long random secret>`
- `WORKER_BASE_URL=http://<your-machine-lan-ip>:8787`
- `EXPO_PUBLIC_WORKER_BASE_URL=http://<your-machine-lan-ip>:8787`
- `CLOUDFLARE_ACCOUNT_ID=<your Cloudflare account id>`
- `AI_GATEWAY_NAME=<your AI Gateway id>`
- `CF_AI_GATEWAY_TOKEN=<your AI Gateway run token if gateway auth is enabled>`
- `CLOUDFLARE_API_TOKEN=<optional fallback account token>`
- `CLOUDFLARE_D1_ID=<remote dev D1 database UUID used by bun run dev:remote>`
- `AI_MODEL_NAME=<optional model, defaults in worker if omitted>`
- `WHOOP_CLIENT_ID=<from Whoop developer portal>`
- `WHOOP_CLIENT_SECRET=<from Whoop developer portal>`

This repo uses its own Infisical project. The local `strength/.infisical.json` file is gitignored and should point at the strength Infisical project, so secrets added only to another project are not visible here.

### WHOOP OAuth Setup

In the [Whoop Developer Portal](https://developer.whoop.com), set your OAuth Redirect URI to:

```
${WORKER_BASE_URL}/api/auth/whoop/callback
```

For local development with the iOS simulator on the same Mac, this would be:

```
http://localhost:8787/api/auth/whoop/callback
```

If you are only using an iOS simulator on the same Mac, loopback works. For Expo Go on a physical device, Android emulator, or standalone APK, `EXPO_PUBLIC_WORKER_BASE_URL` must be reachable from that device. `127.0.0.1` points at the device itself and auth requests will fail.

WHOOP requires HTTPS redirect URIs unless the host ends in `localhost`, so physical-device Expo Go OAuth should use a Cloudflare Tunnel instead of a LAN HTTP URL.

One-time Cloudflare Tunnel setup:

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create strength-dev
cloudflared tunnel route dns strength-dev strength-dev.your-domain.com
```

Set these in Infisical `dev`:

```bash
CLOUDFLARE_TUNNEL_TOKEN=<token from Cloudflare Zero Trust tunnel configuration>
CLOUDFLARE_TUNNEL_HOSTNAME=strength-dev.your-domain.com
WORKER_BASE_URL=https://strength-dev.your-domain.com
```

Then add this WHOOP redirect URI:

```text
https://strength-dev.your-domain.com/api/auth/whoop/callback
```

Configure the tunnel's public hostname in Cloudflare Zero Trust to route `strength-dev.your-domain.com` to `http://localhost:8787`. With `CLOUDFLARE_TUNNEL_TOKEN` and `CLOUDFLARE_TUNNEL_HOSTNAME` set, `bun run dev` and `bun run dev:remote` automatically start the tunnel on whichever machine is running the Worker and point the worker config at the HTTPS hostname. `dev` uses local D1; `dev:remote` uses remote dev D1.

The dev script runs `cloudflared tunnel run --token "$CLOUDFLARE_TUNNEL_TOKEN"` as a child process of `bun run dev`, so the tunnel is stopped when the Worker dev process stops and no machine-specific `~/.cloudflared/*.json` credential file is required. Do not run the same tunnel as a login item, LaunchAgent, or systemd service for local development; it should only be active while `bun run dev` or `bun run dev:remote` is running.

If you prefer local named-tunnel credentials instead of a token, set `CLOUDFLARE_TUNNEL_NAME=strength-dev` with `CLOUDFLARE_TUNNEL_HOSTNAME`. That fallback still depends on credentials in `~/.cloudflared`, so it is less portable across machines.

This should be a public hostname, not a Cloudflare private hostname or private CIDR route. WHOOP's OAuth service must be able to call the redirect URI from the public internet, and it will not be on your Cloudflare WARP/private network. Keep the tunnel config in Infisical `dev` only, stop `bun run dev` when not testing, and rely on the worker's app auth for protected APIs. The OAuth callback path itself must remain publicly reachable for WHOOP to complete the flow.

## Local setup

1. Install the Infisical CLI.
2. Authenticate locally with `infisical login`.
3. Create or confirm the ignored local project config with `infisical init`.
4. Install dependencies with `bun install`.
5. Create a remote dev D1 database with `cd apps/worker && wrangler d1 create strength-db-dev-remote`.
6. Store the returned database UUID in Infisical `dev` as `CLOUDFLARE_D1_ID`.
7. Apply the local migration with `bun run db:push:dev`.

`apps/worker/wrangler.toml` is generated at runtime from [apps/worker/wrangler.template.toml](/Users/steven/strength/apps/worker/wrangler.template.toml:1). It contains plaintext secret values, is gitignored, and should never be committed.

## Development

```bash
bun run dev
```

Starts both the worker and Expo app concurrently. Worker runs through `infisical run` with Cloudflare Tunnel if configured. Expo writes Infisical `dev` secrets to `.env.local` (gitignored) for Metro bundler to inline.

Or run them separately:

```bash
bun run dev:expo  # Expo only
```

`.env.local` is gitignored (by `*.local` pattern). Use `.env.example` as a template for other environments.

To run the worker against the remote dev D1 database instead of local persisted D1:

```bash
bun run dev:remote
```

The Worker serves Better Auth at `/api/auth/*`, and Expo talks to it using the Better Auth Expo client plugin with SecureStore-backed cookie handling.

## GitHub Actions OIDC

GitHub Actions fetches deployment secrets from Infisical at runtime using OIDC. The Infisical machine identity should be configured with:

- Identity ID: `78fef9da-6701-477e-940b-2960913a7252`
- OIDC Discovery URL: `https://token.actions.githubusercontent.com`
- Issuer: `https://token.actions.githubusercontent.com`
- Subject: `repo:steviebd/strength:*`
- Audience: `https://github.com/steviebd`

Set `INFISICAL_PROJECT_SLUG` as a GitHub repository or organization secret. Do not store `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, or `INFISICAL_PROJECT_ID` as GitHub secrets; deploy workflows use short-lived OIDC tokens instead.

## Notes

- This starter is intentionally small and only solves the auth bootstrap flow.
- `APP_ENV` gates auth so production deploys do not accidentally expose unfinished auth behavior.
