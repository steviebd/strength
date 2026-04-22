# AGENTS.md

## Tooling (Vite+)

Linting, formatting, and type-checking are handled by Vite+ (oxlint + oxfmt + tsc). Tests use Vitest.

```bash
bun run check        # vp check: lint + fmt + typecheck (warnings pass, errors fail)
bun run check --fix  # auto-fix linting and formatting
bun run test         # vp test run (Vitest, node environment)
bun run lint         # vp lint (oxlint only)
bun run fmt          # vp fmt (oxfmt only)
```

Note: `bun run check` exits 0 even with lint warnings (warnings are not errors). To suppress warnings for intentionally unused code (e.g., catch parameters), add `/* oxlint-disable no-unused-vars */` at the top of the file. Run `bun run check --fix` to auto-fix formatting and lint issues.

## Dev Commands

All dev commands inject secrets via Infisical. Never run the underlying commands directly during development — always prefix with `infisical run --env=dev`.

```bash
bun run dev:worker   # starts Hono/Cloudflare Worker on 0.0.0.0:8787
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

1. `cd apps/worker && wrangler d1 create strength-db`
2. Paste the returned `database_id` into `apps/worker/wrangler.toml` under `database_id`
3. `bun run db:apply:local`

wrangler.toml uses relative path `../../packages/db/drizzle/migrations` for migrations — always run from project root or adjust.

## Network / Auth for Physical Devices

`wrangler dev` binds to `0.0.0.0`. The Expo app's `BETTER_AUTH_URL` and `EXPO_PUBLIC_API_URL` must point to your machine's LAN IP (not `127.0.0.1`) when testing from a physical Android device or emulator. Use `ifconfig` to find your LAN IP.

## TypeScript

Root `tsconfig.json` extends `expo/tsconfig.base` with `strict: true`. Each package also has its own `tsconfig.json`.

## No .env File

Secrets are injected by Infisical at runtime. There is no `.env` file in the repo.

## Package Manager

Bun (bun@1.2.9). Use `bun install`, `bun run`, etc. Do not use npm/yarn/pnpm.
