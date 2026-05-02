# Maestro E2E

These flows default to Expo Go for local development. Use a standalone/dev APK only when you need
to test native build behavior.

Required environment comes from Infisical `dev`:

- `WORKER_BASE_URL` or `EXPO_PUBLIC_WORKER_BASE_URL`
- `E2E_TEST_SECRET`
- `E2E_EMAIL`
- `E2E_PASSWORD`

`MAESTRO_APP_ID` defaults to `host.exp.exponent` for Expo Go. `MAESTRO_OPEN_LINK` defaults to
`exp://10.0.2.2:8081`, which is the Android emulator URL for the Expo dev server. For a physical
device, set it to your machine's LAN IP, for example `exp://10.0.0.41:8081`.

Start the E2E dev stack:

```bash
bun run dev:e2e
```

This starts the Worker through Infisical with local D1 and `E2E_TEST_MODE=true`, then starts Expo.
`E2E_TEST_SECRET` protects `/api/e2e/reset-user`, which each flow calls before it starts.
Use `bun run dev:e2e:remote` when you explicitly want remote dev D1 instead.

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

Recommended Expo Go loop:

```bash
# terminal 1: Worker + Expo
bun run dev:e2e

# open the project in Expo Go on the emulator/device

# terminal 2: run one flow
bun run e2e:maestro:auth
```

For a physical Android device:

```bash
MAESTRO_OPEN_LINK=exp://<your-lan-ip>:8081 bun run e2e:maestro:auth
```

To run against a built APK instead of Expo Go:

```bash
MAESTRO_APP_ID=com.strength.app bun run e2e:maestro
```

To launch Maestro Studio with Infisical-loaded env:

```bash
bun run e2e:maestro:studio
```

If you open the Maestro desktop app directly, it will not inherit Infisical env from this repo. Launch
Studio through the script above, or set `MAESTRO_APP_ID`, `WORKER_BASE_URL`, `E2E_TEST_SECRET`,
`E2E_EMAIL`, and `E2E_PASSWORD` in Studio before running `00-auth.yml`.
