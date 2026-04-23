# Production Deployment Plan

## Goal

Set up production-ready CI/CD so that:

- GitHub Actions stores **only** the Infisical Machine Identity credentials
- All other deploy/build configuration is fetched from **Infisical** at runtime
- Cloudflare Worker deploys use the correct per-environment runtime secrets without leaking CI credentials into Worker runtime
- Expo native release automation is handled by **EAS Workflows**
- Android production releases build an **AAB** and submit to **Google Play Internal Testing** by default

This document is written as a handoff for someone else to implement.

---

## Final Architecture

### Secret ownership

**GitHub Actions secrets**

Store only:

- `INFISICAL_CLIENT_ID`
- `INFISICAL_CLIENT_SECRET`

These are used only so GitHub Actions can authenticate to Infisical and fetch environment-specific values.

**Infisical**

Use Infisical as the source of truth for environment-specific values in:

- `dev`
- `staging`
- `prod`

Infisical should hold:

- `APP_ENV`
- `BETTER_AUTH_SECRET`
- `WORKER_BASE_URL`
- `BETTER_AUTH_TRUSTED_ORIGINS`
- `ENCRYPTION_MASTER_KEY`
- `WHOOP_CLIENT_ID`
- `WHOOP_CLIENT_SECRET`
- `WHOOP_WEBHOOK_SECRET`
- `AI_GATEWAY_NAME`
- `AI_MODEL_NAME`
- `CF_AI_GATEWAY_TOKEN`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `D1_DATABASE_ID`

**Cloudflare**

Cloudflare is the runtime home for:

- Worker code
- Worker runtime secrets
- D1 databases

**EAS**

EAS owns:

- native build credentials
- Play submission credentials
- EAS environment variables used during app builds
- EAS Workflows for Android build/release automation

Infisical remains canonical, but EAS still needs its own mirrored copy of any app build-time values it requires.

---

## Branch and Environment Mapping

| Source | Infisical env | Cloudflare env | EAS profile/env |
| ------ | ------------- | -------------- | --------------- |
| local dev | `dev` | local/top-level | `development` |
| `staging` branch | `staging` | `staging` | `staging` |
| `main` branch | `prod` | `production` | `production` |
| tag `v*` | `prod` | `production` | `production` |

---

## Important Corrections From The Previous Plan

These are intentional corrections and should not be reverted:

1. Do **not** use a single exported `.env` file for both CLI auth and Worker runtime secret upload.
2. Do **not** upload `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, or other CI-only credentials as Worker secrets.
3. Do **not** rely on `${D1_DATABASE_ID}` variable substitution inside `wrangler.toml`.
4. Do **not** make Android production builds as `apk` if the release is meant for Play Store submission.
5. Do **not** run mobile release automation from GitHub Actions as the primary system.
6. Do **not** depend on `source .env && ...` for CI steps that need environment variables in child processes.
7. Do **not** use `eas secret:create --profile ...` in the implementation; the current CLI shape does not match that assumption.

---

## Required Repo Changes

The implementation work should update or create these files:

- `TODO_PRODUCTION.md`
- `apps/worker/wrangler.toml`
- `apps/worker/package.json`
- `apps/expo/eas.json`
- `apps/expo/.eas/workflows/staging-android.yml`
- `apps/expo/.eas/workflows/release-android.yml`
- `.github/workflows/check.yml`
- `.github/workflows/worker-deploy.yml`

Do **not** rename `apps/expo/app.json` unless there is a separate reason. It is acceptable as-is for this plan.

---

## Step 1: Infisical Setup

### Machine Identity

Create or confirm an Infisical Machine Identity that can read:

- `staging`
- `prod`

GitHub Actions will use only this identity.

### GitHub secrets

In GitHub repository settings, add only:

| Secret | Purpose |
| ------ | ------- |
| `INFISICAL_CLIENT_ID` | Infisical machine identity client ID |
| `INFISICAL_CLIENT_SECRET` | Infisical machine identity client secret |

### Required Infisical values

For each of `staging` and `prod`, confirm the following exist:

| Key | Staging value | Prod value |
| --- | ------------- | ---------- |
| `APP_ENV` | `staging` | `production` |
| `BETTER_AUTH_SECRET` | unique secret | unique secret |
| `WORKER_BASE_URL` | staging Worker URL | prod Worker URL |
| `BETTER_AUTH_TRUSTED_ORIGINS` | staging allowed origins | prod allowed origins |
| `ENCRYPTION_MASTER_KEY` | unique secret | unique secret |
| `WHOOP_CLIENT_ID` | correct env value | correct env value |
| `WHOOP_CLIENT_SECRET` | correct env value | correct env value |
| `WHOOP_WEBHOOK_SECRET` | correct env value | correct env value |
| `AI_GATEWAY_NAME` | `workout-ai-staging` | `workout-ai-prod` |
| `AI_MODEL_NAME` | `workers-ai/@cf/moonshotai/kimi-k2.5` | same |
| `CF_AI_GATEWAY_TOKEN` | valid token | valid token |
| `CLOUDFLARE_API_TOKEN` | valid deploy token | valid deploy token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID | Cloudflare account ID |
| `D1_DATABASE_ID` | staging DB ID | prod DB ID |

Notes:

- `WORKER_BASE_URL` should point to the deployed Worker base URL for that environment.
- `APP_ENV` must remain `development` only in local dev. Non-dev auth behavior is intentionally different in the Worker code.

---

## Step 2: Cloudflare Resources

Create or confirm these D1 databases:

- `strength-db-staging`
- `strength-db`

After creation:

- record the actual IDs
- store them in Infisical as `D1_DATABASE_ID`
- use the real IDs directly in `apps/worker/wrangler.toml`

Do not leave placeholder values in `wrangler.toml`.

---

## Step 3: Rewrite `apps/worker/wrangler.toml`

Current file: [apps/worker/wrangler.toml](/Users/steven/strength/apps/worker/wrangler.toml:1)

The file should be restructured to define:

- top-level local/dev config
- `[env.staging]`
- `[env.production]`
- explicit D1 bindings for each environment
- explicit `vars` for each environment

### Requirements

1. Keep local dev as the top-level/default config.
2. Add a staging environment named `strength-worker-staging`.
3. Keep production as `strength-worker`.
4. Define the correct D1 binding in each environment block.
5. Define environment-specific vars in each environment block because Wrangler `vars` are non-inheritable.

### Expected variable placement

**Top-level/local dev**

- `WHOOP_SYNC_RATE_LIMIT_PER_HOUR`
- `AI_GATEWAY_NAME = "workout-ai-dev"`
- `AI_MODEL_NAME = "workers-ai/@cf/moonshotai/kimi-k2.5"`
- optional local `APP_ENV = "development"` if needed for clarity

**Staging**

- `APP_ENV = "staging"`
- `WHOOP_SYNC_RATE_LIMIT_PER_HOUR = "10"`
- `AI_GATEWAY_NAME = "workout-ai-staging"`
- `AI_MODEL_NAME = "workers-ai/@cf/moonshotai/kimi-k2.5"`

**Production**

- `APP_ENV = "production"`
- `WHOOP_SYNC_RATE_LIMIT_PER_HOUR = "10"`
- `AI_GATEWAY_NAME = "workout-ai-prod"`
- `AI_MODEL_NAME = "workers-ai/@cf/moonshotai/kimi-k2.5"`

### D1 binding requirements

Set the correct `database_id` directly for:

- local/dev top-level database
- staging database
- production database

Do not use `${D1_DATABASE_ID}` interpolation inside `wrangler.toml`.

---

## Step 4: Update Worker Scripts

Current file: [apps/worker/package.json](/Users/steven/strength/apps/worker/package.json:1)

Add scripts for:

- `deploy:staging`
- `deploy:prod`
- `db:apply:staging`
- `db:apply:prod`

### Script behavior requirements

Use `infisical run --env=<env> -- <command>` instead of exporting then sourcing dotenv files.

### Required behavior for DB migrations

`db:apply:staging`

- run against the staging D1 database
- use Wrangler staging environment
- run remote migrations only

`db:apply:prod`

- run against the production D1 database
- use Wrangler production environment
- run remote migrations only

### Required behavior for deploy scripts

The deploy flow must separate:

- **CLI auth env vars**
- **Worker runtime secrets**

#### CLI auth env vars

These should be available to Wrangler through process env only:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

#### Worker runtime secrets

Only actual runtime secrets should be uploaded to the Worker. That list should include:

- `BETTER_AUTH_SECRET`
- `ENCRYPTION_MASTER_KEY`
- `WHOOP_CLIENT_SECRET`
- `WHOOP_WEBHOOK_SECRET`
- `CF_AI_GATEWAY_TOKEN`

If other runtime-only secrets are required, include them too.

Do **not** upload these as Worker runtime secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- any GitHub-only or CI-only credentials

### Implementation note

If a temp secret file is used with `wrangler deploy --secrets-file`, it must contain **only** runtime Worker secrets. The implementation can generate it as part of the script, but it must not include deploy credentials.

---

## Step 5: GitHub Actions For Checks

Create `.github/workflows/check.yml`.

### Purpose

Run repository checks on:

- pull requests
- pushes to `dev`
- pushes to `staging`
- pushes to `main`

### Required steps

1. Checkout repository
2. Install Bun / dependencies
3. Resolve environment mapping:
   - `main` -> `prod`
   - `staging` -> `staging`
   - everything else -> `dev`
4. Authenticate to Infisical using:
   - `INFISICAL_CLIENT_ID`
   - `INFISICAL_CLIENT_SECRET`
5. Run:
   - `infisical run --env=<env> -- bun run check`
6. Optionally also run:
   - `infisical run --env=<env> -- bun run test`

### Important requirement

Do not use:

```bash
source .env && bun run check
```

Use `infisical run` so subprocesses inherit the environment reliably.

---

## Step 6: GitHub Actions For Worker Deploy

Create `.github/workflows/worker-deploy.yml`.

### Purpose

Deploy Worker environments from GitHub:

- `staging` branch -> staging Worker
- `main` branch -> production Worker

### Job flow

For each deploy job:

1. Checkout repository
2. Install Bun / dependencies
3. Resolve environment mapping:
   - `staging` branch -> `staging`
   - `main` branch -> `prod` plus Cloudflare `production`
4. Authenticate to Infisical via GitHub secrets
5. Run remote D1 migrations for the target environment
6. Deploy the Worker for the target environment

### Required commands

Use `infisical run` with the worker package scripts.

Examples of the intended shape:

```bash
infisical run --env=staging -- bun run --filter @strength/worker db:apply:staging
infisical run --env=staging -- bun run --filter @strength/worker deploy:staging
```

```bash
infisical run --env=prod -- bun run --filter @strength/worker db:apply:prod
infisical run --env=prod -- bun run --filter @strength/worker deploy:prod
```

### GitHub environments

Create:

- `staging`
- `prod`

Recommended protection:

- `staging`: no manual approval required
- `prod`: require approval before deploy

---

## Step 7: Add `apps/expo/eas.json`

Create `apps/expo/eas.json`.

This file should live inside the Expo app directory, not at repo root.

### Required build profiles

#### `development`

- development client
- internal distribution

#### `staging`

- Android build for staging QA/testing
- installable artifact is acceptable here
- no auto-submit

#### `production`

- `autoIncrement: true`
- Android build type must be `app-bundle`
- no `apk` for production Play submission

### Required submit profile

`submit.production.android`

- track must be `internal`

This means production release automation sends builds to **Google Play Internal Testing**, not directly to the public production rollout.

---

## Step 8: Add EAS Workflows

Create the directory:

- `apps/expo/.eas/workflows/`

Create:

- `apps/expo/.eas/workflows/staging-android.yml`
- `apps/expo/.eas/workflows/release-android.yml`

These workflows should be valid against the current EAS workflow schema.

### `staging-android.yml`

Purpose:

- run on pushes to `staging`
- build Android using profile `staging`
- do not submit to Play

### `release-android.yml`

Purpose:

- run on tags matching `v*`
- build Android using profile `production`
- submit Android using submit profile `production`
- land in Play Internal Testing track

### Ownership rule

EAS Workflows is the primary system for native app release automation.

GitHub Actions should **not** become the main place where `eas build` / `eas submit` is managed unless there is a separate deliberate architecture decision.

---

## Step 9: Mirror Required App Build Variables Into EAS

Because Expo builds run inside EAS, EAS still needs a mirrored copy of the app build-time variables it consumes.

### Canonical policy

- Infisical is the source of truth
- EAS mirrors only the subset required by app builds

### Minimum variable to mirror

- `EXPO_PUBLIC_API_URL`

Add any future Expo build-time environment variables using the same policy.

### Implementation rule

Do not use `eas secret:create --profile ...` in the implementation.

Use the current EAS environment variable / secret workflow supported by the installed CLI and the chosen EAS setup.

### Expected result

- staging app builds resolve `WORKER_BASE_URL` to the staging Worker
- production app builds resolve `WORKER_BASE_URL` to the prod Worker

---

## Step 10: Android Credentials And Submission Policy

Use **EAS-managed credentials** as the default.

### Rules

1. Do not keep a separate `EAS_BUILD_CREDENTIALS` blob in Infisical unless there is a hard operational reason.
2. If a service account file is required for submission, manage it using EAS-supported credential/secret mechanisms consistently.
3. Default automated release target is:
   - Google Play Internal Testing
4. Promotion from internal testing to wider rollout remains manual unless a later automation step is added intentionally.

### Production artifact requirement

Production Play submissions must use **AAB**, not APK.

---

## Step 11: Validation Checklist

The implementer should verify all of the following.

### Repo and CI

- [ ] PRs run `bun run check`
- [ ] CI uses only `INFISICAL_CLIENT_ID` and `INFISICAL_CLIENT_SECRET` from GitHub secrets
- [ ] CI uses `infisical run --env=... -- ...` instead of `source .env && ...`

### Cloudflare Worker

- [ ] `staging` branch deploys the staging Worker
- [ ] `main` branch deploys the production Worker
- [ ] staging deploy uses staging D1
- [ ] production deploy uses production D1
- [ ] runtime Worker secret upload excludes Cloudflare deploy credentials
- [ ] `/api/health` succeeds after deploy

### Environment correctness

- [ ] staging `WORKER_BASE_URL` points to the staging Worker
- [ ] prod `WORKER_BASE_URL` points to the prod Worker

### EAS

- [ ] `apps/expo/eas.json` exists and is valid
- [ ] `apps/expo/.eas/workflows/staging-android.yml` exists and validates
- [ ] `apps/expo/.eas/workflows/release-android.yml` exists and validates
- [ ] staging workflow builds Android with the `staging` profile
- [ ] release workflow builds Android with the `production` profile
- [ ] production artifact is an AAB
- [ ] production release submits to Play Internal Testing

### Runtime behavior

- [ ] local dev still works with the existing Infisical dev flow
- [ ] app still resolves localhost/LAN correctly in dev via [apps/expo/lib/env.ts](/Users/steven/strength/apps/expo/lib/env.ts:15)
- [ ] non-dev auth behavior remains unchanged from current Worker code

---

## Implementation Order

Use this order so the work is less error-prone:

1. Populate missing Infisical values for `staging` and `prod`
2. Create/confirm D1 staging and production databases
3. Rewrite `apps/worker/wrangler.toml`
4. Add worker package scripts
5. Add `.github/workflows/check.yml`
6. Add `.github/workflows/worker-deploy.yml`
7. Add `apps/expo/eas.json`
8. Mirror required app build variables into EAS
9. Add EAS workflows
10. Test staging branch end-to-end
11. Test production tag flow into Play Internal Testing

---

## Acceptance Criteria

This work is complete when:

- GitHub Actions stores only the Infisical machine identity credentials
- all other environment-specific values are sourced from Infisical
- Worker deploys do not leak CI credentials into Worker runtime
- staging and production Worker deploys are automated through GitHub Actions
- Android app build/release automation is implemented through EAS Workflows
- production Android releases build AABs and submit to Play Internal Testing
- the repo contains the config/workflow files listed in this document

---

## Implementation Status

**Completed:** 2026-04-22

### Step 1: Infisical Setup ✅
- Machine Identity configured (INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET in GitHub secrets)
- `staging` and `prod` environments populated with all required secrets:
  - `D1_DATABASE_ID` (real IDs from Cloudflare)
  - `APP_ENV`
  - `BETTER_AUTH_SECRET`
  - `WORKER_BASE_URL` (placeholder - will update after first deploy)
  - `BETTER_AUTH_TRUSTED_ORIGINS`
  - `ENCRYPTION_MASTER_KEY`
  - `WHOOP_SYNC_RATE_LIMIT_PER_HOUR`
  - `AI_GATEWAY_NAME` (workout-ai-staging / workout-ai-prod)
  - `AI_MODEL_NAME` (same both envs)
  - Existing WHOOP secrets (CLIENT_ID, CLIENT_SECRET, WEBHOOK_SECRET)
  - Existing CF_AI_GATEWAY_TOKEN

### Step 2: Cloudflare Resources ✅
- Created `strength-db-staging` (ID: `32ee6818-3efa-4bd9-80df-c3f2366941ec`)
- Created `strength-db-prod` (ID: `1dbcef97-07b8-4dd2-85d4-035792ae5581`)

### Step 3: Rewrite wrangler.toml ✅
- Top-level: local dev config (no database_id for local SQLite)
- `[env.staging]`: name=strength-worker-staging, D1=32ee6818-..., staging vars
- `[env.production]`: name=strength-worker-prod, D1=1dbcef97-..., prod vars

### Step 4: Worker Package Scripts ✅
- Added `deploy:staging`, `deploy:prod`, `db:apply:staging`, `db:apply:prod`
- All use `infisical run --env=<env> --` pattern

### Step 5: GitHub Actions check.yml ✅
- Triggers on PR + pushes to dev/staging/main
- Environment mapping: main→prod, everything else→staging (per updated rule: non-main = staging)
- Uses `infisical run --env=$ENV_NAME -- bun run check`

### Step 6: GitHub Actions worker-deploy.yml ✅
- Triggers on pushes to staging/main/master
- deploy-staging: any non-main branch → staging env
- deploy-production: main/master → prod env
- Runs db migrations then deploy via infisical run

### Step 7: eas.json ✅
- development: devClient + internal distribution
- staging: Android APK for QA
- production: AAB with autoIncrement

### Step 8 & 9: EAS Workflows ✅
- staging-android.yml: triggers on staging pushes, builds with staging profile
- release-android.yml: triggers on v* tags, builds AAB + submits to Play Internal Testing

### .env.example ✅
- Updated to document all env vars with per-environment values
- Includes D1_DATABASE_ID placeholder
- Notes that staging/prod are managed via Infisical

---

## Follow-up Steps (After First Worker Deploy)

1. **Update WORKER_BASE_URL** in Infisical:
   - After staging Worker first deploys, update staging env URLs to real Worker URL
   - After prod Worker first deploys, update prod env URLs to real Worker URL

2. **Create GitHub Environments** in GitHub repo settings:
   - `staging`: no manual approval needed
   - `prod`: consider requiring approval before deploys

3. **Test the CI/CD pipeline**:
   - Push to a non-main branch → verify staging deploy
   - Push to main → verify production deploy
   - Check `/api/health` on both deploys

4. **EAS credential setup** (Step 10):
   - EAS-managed credentials for Android builds
   - Service account for Play submission (if needed)

5. **First EAS build test**:
   - Test staging workflow by pushing to staging branch
   - Test release workflow by creating a v* tag
