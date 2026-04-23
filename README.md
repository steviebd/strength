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
- `BETTER_AUTH_URL=http://<your-machine-lan-ip>:8787`
- `EXPO_PUBLIC_API_URL=http://<your-machine-lan-ip>:8787`
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
${BETTER_AUTH_URL}/api/auth/whoop/callback
```

For local development with the iOS simulator on the same Mac, this would be:

```
http://localhost:8787/api/auth/whoop/callback
```

For physical devices or Android emulator, use your machine's LAN IP (e.g., `http://192.168.1.x:8787/api/auth/whoop/callback`).

If you are only using an iOS simulator on the same Mac, loopback works. For Expo Go on a physical device or Android emulator, `127.0.0.1` points at the device itself and auth requests will fail.

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

Run these in separate terminals:

```bash
bun run dev
bun run dev:expo
```

`bun run dev` starts the worker against local persisted D1. Worker dev commands run through `infisical run`, then generate `apps/worker/wrangler.toml` before starting Wrangler.

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

Set `INFISICAL_PROJECT_SLUG` as a GitHub repository or organization variable. Do not store `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, or `INFISICAL_PROJECT_ID` as GitHub secrets; deploy workflows use short-lived OIDC tokens instead.

## Notes

- This starter is intentionally small and only solves the auth bootstrap flow.
- `APP_ENV` gates auth so production deploys do not accidentally expose unfinished auth behavior.
