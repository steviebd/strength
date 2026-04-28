# Maestro E2E

These flows target a standalone/dev build with `appId: com.strength.app`. They are not intended
for Expo Go.

Required environment:

```bash
export WORKER_BASE_URL=http://127.0.0.1:8787
export E2E_TEST_SECRET=local-e2e-secret
export E2E_EMAIL=maestro-e2e@example.com
export E2E_PASSWORD='Password123!'
```

The worker must run with:

```bash
APP_ENV=development E2E_TEST_MODE=true E2E_TEST_SECRET=local-e2e-secret
```

Because `apps/worker/wrangler.toml` is generated, regenerate it with those local variables present
before starting `wrangler dev`.

Coverage:

- `00-auth.yml`: reset test account, sign up, onboarding prompts, sign out, sign in.
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
