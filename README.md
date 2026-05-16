# strength

Fitness tracking app with WHOOP sync, structured training programs, and nutrition logging.

## Stack

- **Expo Router** (SDK 55) — cross-platform app
- **Cloudflare Worker + D1** — backend API
- **Drizzle ORM** — database access
- **Better Auth** — email/password authentication
- **pnpm workspaces** — monorepo package management

## Quick Start

1. `pnpm install`
2. `infisical login && infisical init` — select the strength project
3. `cd apps/worker && wrangler d1 create strength-db-dev-remote`
4. Store the D1 UUID in Infisical `dev` as `CLOUDFLARE_D1_ID`
5. `pnpm run db:apply:local`
6. `pnpm run dev`

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

Email/password and Google sign up/sign in via Better Auth, mounted on the Worker at `/api/auth/*`. Auth is **enabled only when `APP_ENV=development`**.

#### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create an OAuth client ID (Web application)
2. Add authorized redirect URIs:
   - `https://<your-worker-domain>/api/auth/callback/google`
   - For local dev: `http://localhost:8787/api/auth/callback/google`
3. Add to Infisical `dev`:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

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
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32` |
| `WORKER_BASE_URL` | `http://<lan-ip>:8787` (local dev) |
| `EXPO_PUBLIC_WORKER_BASE_URL` | Same as `WORKER_BASE_URL` |
| `CLOUDFLARE_D1_ID` | Remote dev D1 UUID |
| `WHOOP_CLIENT_ID` | From Whoop Developer Portal |
| `WHOOP_CLIENT_SECRET` | From Whoop Developer Portal |

**Required in Infisical `staging` and `prod` for native builds:**

| Secret | Notes |
|--------|-------|
| `EXPO_PUBLIC_WORKER_BASE_URL` | HTTPS Worker URL embedded into the native app bundle |
| `EXPO_PUBLIC_APP_SCHEME` | `strength-staging` for staging, `strength` for prod. Also injected into the Worker as `APP_SCHEME` for CORS/trusted origins. |

`pnpm run dev:expo` writes Infisical `dev` `EXPO_PUBLIC_*` values to
`apps/expo/.env.local` before starting Metro. `pnpm run dev:expo:staging` and
`pnpm run build:android:staging` write Infisical `staging` values first. Build scripts
validate that `EXPO_PUBLIC_WORKER_BASE_URL` is present and HTTPS for staging/prod,
then pass the generated values directly to `eas build --local`.

**Build outputs:**

| Environment | App Name | Android Package | iOS Bundle ID |
|-------------|----------|-----------------|---------------|
| Staging | `strength-staging` | `com.strength.app.staging` | `com.strength.app.staging` |
| Production | `strength` | `com.strength.app` | `com.strength.app` |

Staging and production apps can be installed side-by-side because they use different package/bundle identifiers.

**Required in all environments:**

| Secret | Notes |
|--------|-------|
| `RATE_LIMIT_NAMESPACE_AUTH`, `RATE_LIMIT_NAMESPACE_GENERAL`, `RATE_LIMIT_NAMESPACE_CHAT`, `RATE_LIMIT_NAMESPACE_WHOOP` | Namespace IDs for Cloudflare Rate Limiting bindings (unique positive integers per account) |
| `RATE_LIMIT_AUTH`, `RATE_LIMIT_GENERAL`, `RATE_LIMIT_CHAT`, `RATE_LIMIT_WHOOP` | Per-60s rate limits for each namespace |

**Optional:**

| Secret | Notes |
|--------|-------|
| `AI_GATEWAY_NAME` | Cloudflare AI Gateway ID |
| `AI_MODEL_NAME` | Model name (defaults in worker) |

### Local Dev Overrides

Create `apps/worker/.dev.vars` (already gitignored) to override Worker vars locally without touching Infisical:

```env
SKIP_RATE_LIMIT=true
```

When `APP_ENV=development` and `SKIP_RATE_LIMIT=true`, all API rate limits are bypassed. Remove the file or set `SKIP_RATE_LIMIT=false` to re-enable them.

## Development

```bash
pnpm run dev              # Worker + Expo concurrently (local D1)
pnpm run dev:remote       # Worker against remote dev D1
pnpm run dev:expo         # Expo only

pnpm run build:android:staging  # Local EAS APK build (staging)
pnpm run build:android:prod     # Local EAS APK build (production)
pnpm run build:ios:staging      # Local EAS IPA build (staging)
pnpm run build:ios:prod         # Local EAS IPA build (production)

pnpm run db:apply:local   # Push migrations to local D1
pnpm run db:apply:remote   # Push migrations to remote dev D1
pnpm run db:generate       # Generate new migration
```

### Testing Physical Devices

`WORKER_BASE_URL` must point to your machine's LAN IP (not `127.0.0.1`) when testing from a physical device or emulator. Find it with `ifconfig`.

For WHOOP OAuth on physical devices, use a Cloudflare Tunnel instead of LAN HTTP. See `AGENTS.md` for tunnel setup.

## Deployment

GitHub Actions deploys via Infisical OIDC — no long-lived credentials stored as secrets.

```bash
pnpm run check   # lint + typecheck + tests
```

### Cloudflare Queues

Nutrition chat runs through a Cloudflare Queue. Create each remote queue once before
deploying an environment:

```bash
cd apps/worker
infisical run --env=staging --project-config-dir ../.. -- wrangler queues create strength-nutrition-chat-staging --message-retention-period-secs 86400
infisical run --env=prod --project-config-dir ../.. -- wrangler queues create strength-nutrition-chat-prod --message-retention-period-secs 86400
```

The explicit retention value keeps queue creation compatible with Cloudflare Workers
Free. Older Wrangler versions default to a retention period that Free queues reject.
Queue creation only creates the resource; the queue is connected to the Worker when
the Worker is deployed with the generated Wrangler config.

After queue creation, apply migrations and deploy the Worker:

```bash
pnpm run db:apply:staging
pnpm run deploy:staging
```

If the Cloudflare dashboard still shows no consumer after deploy, attach it manually:

```bash
cd apps/worker
infisical run --env=staging --project-config-dir ../.. -- wrangler queues consumer add strength-nutrition-chat-staging strength-worker-staging --batch-size 1
infisical run --env=prod --project-config-dir ../.. -- wrangler queues consumer add strength-nutrition-chat-prod strength-worker-prod --batch-size 1
```

## Packages

| Package | Purpose |
|---------|---------|
| `@strength/expo` | Expo Router app |
| `@strength/worker` | Cloudflare Worker API |
| `@strength/db` | Drizzle schema + migrations |
