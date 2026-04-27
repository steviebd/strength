# strength

Fitness tracking app with WHOOP sync, structured training programs, and nutrition logging.

## Stack

- **Expo Router** (SDK 55) — cross-platform app
- **Cloudflare Worker + D1** — backend API
- **Drizzle ORM** — database access
- **Better Auth** — email/password authentication
- **Bun workspaces** — monorepo package management

## Quick Start

1. `bun install`
2. `infisical login && infisical init` — select the strength project
3. `cd apps/worker && wrangler d1 create strength-db-dev-remote`
4. Store the D1 UUID in Infisical `dev` as `CLOUDFLARE_D1_ID`
5. `bun run db:apply:local`
6. `bun run dev`

## Project Structure

```
apps/
├── expo/           # Expo Router app (SDK 55)
│   ├── app/        # Routes (tabs, modals, etc.)
│   └── lib/        # Auth client, API helpers
└── worker/         # Cloudflare Worker (Hono)
    └── src/
        ├── api/           # REST endpoints
        │   ├── auth.ts
        │   ├── home/
        │   └── nutrition/
        ├── auth.ts        # Better Auth setup
        ├── programs/      # Training programs
        │   ├── wendler531.ts
        │   ├── stronglifts.ts
        │   ├── nuckols.ts
        │   └── ...
        ├── whoop/         # WHOOP OAuth + webhooks
        │   ├── auth.ts
        │   ├── sync.ts
        │   └── webhook.ts
        └── lib/
packages/
└── db/             # Drizzle schema + migrations
    └── src/schema.ts
```

## Features

### Auth

Email/password sign up and sign in via Better Auth, mounted on the Worker at `/api/auth/*`. Auth is **enabled only when `APP_ENV=development`**.

### WHOOP Sync

OAuth flow connects your WHOOP account. Syncs recovery, workouts, and cycles via webhooks. Requires HTTPS redirect URIs (loopback `localhost` only works for iOS simulator on the same Mac; physical devices need a Cloudflare Tunnel).

### Training Programs

Structured programs with periodization:

- Wendler 5/5/1
- Stronglifts 5x5
- Greg Nuckols 28 Programs
- NSuns LP
- And more

Programs generate workouts based on your training max, preferred days, and schedule.

### Nutrition Logging

Log meals, track macros, and get AI-assisted nutrition chat. Daily summaries aggregate intake with training context.

## Configuration

Secrets are injected by Infisical at runtime. No `.env` file.

**Required in Infisical `dev`:**

| Secret | Notes |
|--------|-------|
| `APP_ENV` | `development` |
| `BETTER_AUTH_SECRET` | Generate a long random string |
| `WORKER_BASE_URL` | `http://<lan-ip>:8787` (local dev) |
| `EXPO_PUBLIC_WORKER_BASE_URL` | Same as `WORKER_BASE_URL` |
| `CLOUDFLARE_D1_ID` | Remote dev D1 UUID |
| `WHOOP_CLIENT_ID` | From Whoop Developer Portal |
| `WHOOP_CLIENT_SECRET` | From Whoop Developer Portal |

**Optional:**

| Secret | Notes |
|--------|-------|
| `AI_GATEWAY_NAME` | Cloudflare AI Gateway ID |
| `AI_MODEL_NAME` | Model name (defaults in worker) |

## Development

```bash
bun run dev              # Worker + Expo concurrently (local D1)
bun run dev:remote       # Worker against remote dev D1
bun run dev:expo         # Expo only

bun run db:apply:local   # Push migrations to local D1
bun run db:apply:remote   # Push migrations to remote dev D1
bun run db:generate       # Generate new migration
```

### Testing Physical Devices

`WORKER_BASE_URL` must point to your machine's LAN IP (not `127.0.0.1`) when testing from a physical device or emulator. Find it with `ifconfig`.

For WHOOP OAuth on physical devices, use a Cloudflare Tunnel instead of LAN HTTP. See `AGENTS.md` for tunnel setup.

## Deployment

GitHub Actions deploys via Infisical OIDC — no long-lived credentials stored as secrets.

```bash
bun run check   # lint + typecheck + tests
```

## Packages

| Package | Purpose |
|---------|---------|
| `@strength/expo` | Expo Router app |
| `@strength/worker` | Cloudflare Worker API |
| `@strength/db` | Drizzle schema + migrations |
