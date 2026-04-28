# Maestro E2E

These flows target a standalone/dev build with `appId: com.strength.app`. They are not intended
for Expo Go.

Required environment:

```bash
export WORKER_BASE_URL=http://127.0.0.1:8787
export E2E_EMAIL=your-local-user@example.com
export E2E_PASSWORD='your-local-password'
```

The root `package.json` scripts source `.env.local` automatically before invoking Maestro, so these
values can live in repo-root `.env.local`.

The worker should use local D1 and development auth:

```bash
APP_ENV=development E2E_TEST_MODE=true bun run dev
```

`E2E_TEST_MODE=true` is only needed for deterministic mocked nutrition chat responses. `E2E_TEST_SECRET`
only protects the optional `/api/e2e/reset-user` helper; the default flows do not reset the existing
local user.

Worker config and secrets still come through the existing Infisical-backed dev commands. Do not
expect Maestro to generate `wrangler.toml` or inject Worker secrets.

Coverage:

- `00-auth.yml`: sign in with the existing local D1 user, handle onboarding prompts if shown, sign out.
- `10-workouts.yml`: create a multi-exercise template, start/complete it, verify workout history
  pre-populates the next template session, then verify the same exercise history appears in a custom
  workout.
- `20-programs.yml`: create a StrongLifts program, verify scheduled/program weights, complete a
  cycle session, inspect schedule, and delete the program.
- `30-nutrition.yml`: submit a deterministic Big Mac/fries prompt, verify returned macros, save,
  unsave, re-save, and delete the meal.

Run all flows:

```bash
bun run e2e:maestro
```

The root script loads `.env.local`, adds `$HOME/.maestro/bin` to `PATH`, checks that an Android
device is connected, and installs the newest APK from `apps/expo/builds/` if `com.strength.app` is
not installed yet.
