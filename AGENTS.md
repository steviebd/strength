# AGENTS.md

## Tooling (Vite+)

Linting, formatting, and type-checking are handled by Vite+ (oxlint + oxfmt + tsc). Tests use Vitest.

```bash
bun run check        # vp check: lint + fmt + typecheck (warnings pass, errors fail) + bun run lint:keys
bun run check --fix  # auto-fix linting and formatting
bun run test         # vp test run (Vitest, node environment)
bun run lint         # vp lint (oxlint only)
bun run fmt          # vp fmt (oxfmt only)
```

Note: `bun run check` exits 0 even with lint warnings (warnings are not errors). To suppress warnings for intentionally unused code (e.g., catch parameters), add `/* oxlint-disable no-unused-vars */` at the top of the file. Run `bun run check --fix` to auto-fix formatting and lint issues.

## Dev Commands

Worker config is generated from Infisical-injected environment variables. For local development, authenticate with `infisical login` and create/confirm the ignored local `.infisical.json` with `infisical init`; do not use Machine Identity client credentials for local commands.

```bash
bun run dev         # starts Hono/Cloudflare Worker on 0.0.0.0:8787 with local D1
bun run dev:remote  # starts Hono/Cloudflare Worker on 0.0.0.0:8787 with remote dev D1
bun run dev:expo    # starts Expo dev server

bun run db:generate   # generate Drizzle migrations (runs @strength/db)
bun run db:apply:local # apply migrations to local D1 (runs @strength/worker)
```

## Architecture

- `@strength/expo` — Expo Router app (SDK 54, pinned for Android Expo Go compatibility)
- `@strength/worker` — Cloudflare Worker with Hono; serves Better Auth at `/api/auth/*` and all workout REST APIs
- `@strength/db` — Drizzle ORM schema + SQLite migrations (shared by worker)

Worker entry: `apps/worker/src/index.ts`
DB schema: `packages/db/src/schema.ts`
Migrations: `packages/db/drizzle/migrations/`

## Auth

Auth is **intentionally disabled** unless `APP_ENV=development`. The worker skips auth middleware entirely in non-dev mode. Do not assume auth is active when working on API endpoints.

### Shared Auth Helper

When adding new API route handlers in `apps/worker/src/api/`, always use the shared `requireAuth` helper from `./api/auth`:

```typescript
import { requireAuth } from '../auth';

export async function myHandler(c: any) {
  const { session } = await requireAuth(c);
  if (!session?.user) {
    return c.json({ message: 'Unauthorized' }, 401);
  }
  const userId = session.user.id;
  // ...
}
```

This ensures consistent auth behavior — it checks middleware-set session first, then falls back to re-fetching from the cookie. Handlers that bypass `requireAuth` and call `c.get('session')` directly may fail auth on certain clients (e.g., native Expo apps).

Existing handlers in `index.ts` (inline) and `apps/worker/src/api/nutrition/` (module files) both route through the same `requireAuth` function.

## D1 Database Setup (required on first clone)

1. Run `infisical login`
2. Run `infisical init` and select the strength Infisical project
3. `cd apps/worker && wrangler d1 create strength-db-dev-remote`
4. Store the returned UUID in Infisical `dev` as `CLOUDFLARE_D1_ID`
5. `bun run db:push:dev`

`apps/worker/wrangler.toml` is generated from `apps/worker/wrangler.template.toml` and uses the relative path `../../packages/db/drizzle/migrations` for migrations. It contains plaintext secret values, is gitignored, and should never be committed.

## GitHub Actions OIDC

Deploy workflows use Infisical OIDC, not long-lived Infisical client credentials. Configure the Infisical machine identity with identity ID `78fef9da-6701-477e-940b-2960913a7252`, subject `repo:steviebd/strength:*`, and audience `https://github.com/steviebd`. Set `INFISICAL_PROJECT_SLUG` as a GitHub repository or organization secret, and do not add `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, or `INFISICAL_PROJECT_ID` as GitHub secrets.

## Network / Auth for Physical Devices

`wrangler dev` binds to `0.0.0.0`. The Expo app's `WORKER_BASE_URL` must point to your machine's LAN IP (not `127.0.0.1`) when testing from a physical Android device or emulator. Use `ifconfig` to find your LAN IP.

## TypeScript

Root `tsconfig.json` extends `expo/tsconfig.base` with `strict: true`. Each package also has its own `tsconfig.json`.

## No .env File

Secrets are injected by Infisical at runtime. There is no `.env` file in the repo.

## Package Manager

Bun (bun@1.2.9). Use `bun install`, `bun run`, etc. Do not use npm/yarn/pnpm.
