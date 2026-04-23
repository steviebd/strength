# Web Deployment Plan

## Goal

Deploy one Cloudflare Worker that supports both:

- Native Android/iOS API clients at `/api/*`
- The Expo web app as static assets for all non-API routes

The web app and API should share the same origin in deployed environments, so browser auth cookies are first-party/same-origin and do not need cross-site cookie handling.

---

## Current State

- `@strength/worker` is a Hono Cloudflare Worker that serves all API routes under `/api/*`.
- `@strength/expo` can run as a native app and should also be exported as a static web app.
- Native apps use `EXPO_PUBLIC_WORKER_BASE_URL` to call the Worker API.
- Web currently runs separately during local development, which can cause cookie issues when it calls a different origin.

---

## Target Architecture

```
                            ┌──────────────────────────────┐
                            │      Cloudflare Worker       │
                            │  https://<worker-or-domain>  │
                            └──────────────┬───────────────┘
                                           │
                   ┌───────────────────────┴───────────────────────┐
                   │                                               │
             /api/* requests                                all other requests
                   │                                               │
            Hono API handlers                              Expo web static assets
            D1 + Better Auth                              SPA fallback to index.html
```

### Routing

The Worker should handle requests as follows:

| Request path | Behavior |
|--------------|----------|
| `/api/*` | Run existing Hono API/auth routes |
| Static asset paths from Expo export | Serve the matching file from Worker assets |
| Any other non-API path | Serve `index.html` for Expo Router SPA routing |

This avoids a separate Cloudflare Pages project and avoids separate web/API origins.

---

## Domain Strategy

A custom domain is useful but not required for the architecture.

Recommended staging options:

| Option | Example | Cookie behavior |
|--------|---------|-----------------|
| Worker default domain | `https://strength-worker-staging.<account>.workers.dev` | Works because web and API are same-origin |
| Custom domain | `https://staging.strength.example.com` | Works because web and API are same-origin |

Recommended production option:

| Component | URL |
|-----------|-----|
| Web app | `https://strength.example.com` |
| API | `https://strength.example.com/api/*` |
| Auth callbacks | `https://strength.example.com/api/auth/*` |

Do not split the deployed web app and API across `app.*` and `api.*` unless there is a strong reason. Same-origin is simpler and avoids CORS/cookie edge cases for the browser.

---

## Required Changes

### 1. Expo: Add Static Web Export

**File:** `apps/expo/package.json`

Add a web build script:

```json
{
  "scripts": {
    "web:build": "expo export --platform web"
  }
}
```

Expected output: `apps/expo/dist/`.

### 2. Worker: Bind Expo Web Assets

**File:** `apps/worker/wrangler.template.toml`

Add a Workers static assets binding that points to the Expo web export:

```toml
[assets]
directory = "../expo/dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*"]
```

Notes:

- `run_worker_first = ["/api/*"]` ensures API requests go to Hono instead of asset lookup.
- `not_found_handling = "single-page-application"` makes deep links like `/auth/sign-in` load the web app.
- The generated `wrangler.toml` is ignored, so update the template and generator flow, not just the generated file.

### 3. Worker: Keep API Routes Under `/api/*`

**File:** `apps/worker/src/index.ts`

The existing API route prefix is already correct. Avoid adding a catch-all Hono route for the web app unless the asset binding is not enough.

If manual asset serving is needed later, add it after all `/api/*` routes and use the `ASSETS` binding. Prefer Wrangler's asset routing first because it is simpler.

### 4. Worker Env: Use Same-Origin Base URL for Web

**File:** Infisical staging/prod environments

For each deployed environment:

- `WORKER_BASE_URL` should be the public Worker origin, for example `https://strength-worker-staging.<account>.workers.dev` or `https://staging.strength.example.com`.
- `BETTER_AUTH_TRUSTED_ORIGINS` should include the same public origin.

No separate `api.*` origin is needed.

### 5. Expo Env: Point Native Builds at Worker API

**File:** Infisical staging/prod environments

Set:

```text
EXPO_PUBLIC_WORKER_BASE_URL=https://<worker-or-domain>
```

Native Android/iOS clients will continue calling `${EXPO_PUBLIC_WORKER_BASE_URL}/api/*`.

For the deployed web app, using the same absolute Worker origin is acceptable. A later improvement can make web use same-origin relative API URLs, but it is not required if the configured URL matches the serving origin.

### 6. Deploy Flow

Update deployment so the Worker deploy includes a fresh web export:

1. Install dependencies with Bun.
2. Run `bun --filter @strength/expo web:build`.
3. Generate `apps/worker/wrangler.toml` from Infisical as today.
4. Run the existing Worker deploy command.

Example staging sequence:

```bash
bun install
bun --filter @strength/expo web:build
bun run --filter @strength/worker deploy:staging
```

The GitHub Actions workflow embeds these steps inline in each deploy job (staging/prod). `web:build` runs before `generate:wrangler` so the `dist/` directory exists when wrangler reads the `[assets]` binding.

```yaml
- name: Install dependencies
  run: bun install

- name: Build Expo web assets
  run: bun --filter @strength/expo web:build

- name: Deploy to staging
  working-directory: apps/worker
  run: |
    bun run generate:wrangler --env staging --d1-mode remote
    bunx wrangler d1 migrations apply strength-db-staging --remote --env staging
    bunx wrangler deploy --env staging
```

No `wrangler pages deploy` command is needed.

---

## Cookie Behavior

| Scenario | SameSite | Secure | Works? | Notes |
|----------|----------|--------|--------|-------|
| Local web `localhost:8081` to local API `localhost:8787` | lax | false | Can be awkward | Separate origins during local dev |
| Deployed web and API on same Worker origin | strict | true | Yes | Preferred deployed setup |
| Web on Pages and API on Worker default domains | lax/strict | true | No | Cross-site |
| Web on `app.example.com`, API on `api.example.com` | lax/strict | true | Usually yes | Same-site but cross-origin; more CORS complexity |

The current Worker auth code sets `SameSite=Strict` for HTTPS deployments. That should be fine when the web app and API share the exact same origin.

---

## Alternative Approaches Considered

### 1. Cloudflare Pages + API Worker

Rejected for now. It creates two deploy targets and can create browser cookie/CORS complexity unless both services are carefully configured under the same parent domain.

### 2. Separate `app.*` and `api.*` Subdomains

Rejected for now. This can work, but it is unnecessary because one Worker can serve both the static web app and the API.

### 3. `SameSite=None; Secure`

Rejected for now. It is only needed for genuinely cross-site browser requests. Same-origin Worker hosting avoids that requirement.

---

## Files to Modify/Create

| File | Action |
|------|--------|
| `apps/expo/package.json` | Add `web:build` script |
| `apps/worker/wrangler.template.toml` | Add Workers static assets config |
| `apps/worker/scripts/generate-wrangler-config.ts` | Preserve/render assets config if templating needs adjustment |
| GitHub Actions deploy workflow | Ensure Expo web export runs before Worker deploy |
| Infisical staging/prod secrets | Set `WORKER_BASE_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, and `EXPO_PUBLIC_WORKER_BASE_URL` to the Worker origin |

---

## Acceptance Criteria

- [ ] `bun --filter @strength/expo web:build` creates `apps/expo/dist`.
- [ ] Worker deploy uploads the API Worker and Expo static assets together.
- [ ] `/api/health` returns the Worker health response.
- [ ] `/` loads the Expo web app.
- [ ] A deep web route loads the Expo web app via SPA fallback.
- [ ] Browser auth works on the deployed Worker origin without cross-site cookie rejection.
- [ ] Android/iOS clients continue using the same Worker API base URL.

---

## Status

**Planned** - 2026-04-23
