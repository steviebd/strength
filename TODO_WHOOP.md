# WHOOP Session Expiration Fix — PDD

## Status

Draft

## Overview

WHOOP OAuth tokens expire and can be revoked. The current implementation has gaps in handling expired/revoked sessions, causing silent failures in webhook processing and unclear error responses to the client app.

## Problem Statement

### Current Behavior

| Component | Token Handling | Issue |
|-----------|---------------|-------|
| `sync.ts` | `getValidAccessToken()` + `runWithFreshToken()` (401 retry) | Works correctly |
| `webhook.ts` | `getValidAccessToken()` — no 401 retry | Expired token causes silent failure |
| `/api/whoop/status` | Returns `connected: true` without validating token | Stale connected state |
| `/api/whoop/data` | Returns `400` with plain message | Client can't distinguish error types |
| Error handling | Plain `Error` objects, no codes | Expo app can't trigger re-auth flow |

### Root Cause

`getValidAccessToken()` performs **proactive** refresh (when `< 24hrs until expiry` OR `> 7 days old`), but returns an already-expired token if neither condition is met. When WHOOP returns 401, only `sync.ts` retries — `webhook.ts` propagates the failure silently.

## Goals

1. Centralized, consistent token management across all WHOOP API call sites
2. Automatic token refresh on 401 (single retry) for all call sites
3. Structured error codes so Expo app can trigger re-auth when session is invalid
4. Clear separation: `WHOOP_SESSION_EXPIRED` (token refreshable) vs `WHOOP_REAUTH_REQUIRED` (user must re-authorize)

## Non-Goals

- Changing token rotation constants (`REFRESH_BEFORE_HOURS=24`, `ROTATE_AFTER_DAYS=7`)
- Modifying WHOOP API data models or sync logic
- Changing the OAuth authorization code flow itself

## Architecture

```
whoop/
  errors.ts        — WHOOP_SESSION_EXPIRED, WHOOP_REAUTH_REQUIRED
  token-manager.ts — getValidWhoopToken(), withValidToken<T>()
  client.ts        — Wrapped WHOOP API calls (getWhoopProfile, fetchWorkouts, etc.)
  api.ts           — UNCHANGED (raw WHOOP API functions)
  auth.ts          — UNCHANGED (OAuth exchange/refresh)
  sync.ts          — Updated to use token-manager
  webhook.ts       — Updated to use token-manager
  index.ts         — Barrel export
```

All call sites use `withValidToken(userId, action)`:

```typescript
// Pseudocode
async withValidToken<T>(
  label: string,
  userId: string,
  action: (token: string) => Promise<T>
): Promise<T> {
  const token = await getValidWhoopToken(userId);
  try {
    return await action(token);
  } catch (e) {
    if (e.status === 401) {
      const refreshed = await forceRefreshAccessToken(userId);
      if (!refreshed) throw new WhoopReauthRequiredError(...);
      return action(refreshed.token);
    }
    throw e;
  }
}
```

## New Files

### `whoop/errors.ts`

```typescript
export class WhoopSessionExpiredError extends Error {
  code = 'WHOOP_SESSION_EXPIRED';
  reauthUrl: string | null = null;
  constructor(message: string) { super(message); }
}

export class WhoopReauthRequiredError extends Error {
  code = 'WHOOP_REAUTH_REQUIRED';
  cause: 'token_revoked' | 'refresh_failed' | 'no_refresh_token';
  constructor(cause: WhoopReauthRequiredError['cause'], message: string) {
    super(message);
    this.cause = cause;
  }
}
```

### `whoop/token-manager.ts`

Single source of truth for token operations:

- `getValidWhoopToken(userId)` — Returns valid token, throws `WhoopSessionExpiredError` if no integration
- `withValidToken<T>(label, userId, action)` — Gets token, calls action, 401 retry via force refresh, throws `WhoopReauthRequiredError` if refresh fails
- `isConnected(userId)` — Returns `true` if active WHOOP integration exists
- `markDisconnected(userId)` — Sets `isActive = false` on integration

Implements:
- Proactive refresh when `< 24hrs until expiry` OR `> 7 days old`
- Decryption of stored tokens
- Force refresh + single retry on 401
- Integration deactivation on permanent failure

### `whoop/client.ts`

Wrapped versions of all WHOOP API functions from `api.ts`:

```typescript
export async function getWhoopProfile(userId: string): Promise<WhoopProfile> {
  return withValidToken('getProfile', userId, (token) => rawApi.getWhoopProfile(token));
}
export async function fetchWorkouts(userId: string, start?: Date): Promise<WhoopWorkout[]> {
  return withValidToken('fetchWorkouts', userId, (token) => rawApi.fetchWorkouts(token, start));
}
// ... and 8 more
```

### `whoop/index.ts`

Barrel export for `errors`, `token-manager`, `client`, and `sync`.

## Modified Files

### `whoop/webhook.ts`

Replace `getWhoopAccessToken()` pattern with `withValidToken()`:

```typescript
// BEFORE
const token = await getWhoopAccessToken(db, env, userId);
const workout = await fetchWorkoutById(token, workoutId);

// AFTER
const workout = await withValidToken('fetchWorkout', userId, (token) =>
  fetchWorkoutById(token, workoutId)
);
```

### `whoop/sync.ts`

Replace `runWithFreshToken()` pattern with `withValidToken()` from `token-manager`. Remove `runWithFreshToken` function and `getValidAccessToken` calls.

### `index.ts` — Endpoint Changes

**`GET /api/whoop/status`**
- Validate token via `getValidWhoopToken()`
- If invalid/expired: return `{ connected: false, error: 'WHOOP_SESSION_EXPIRED' }`
- If connected: return `{ connected: true, whoopUserId, profile }`

**`GET /api/whoop/data`**
- If WHOOP not connected or session invalid: return `401` with `{ error: 'WHOOP_SESSION_EXPIRED', message: '...' }`

## Deleted Files

- `apps/worker/src/whoop/token-rotation.ts` — Superseded by `token-manager.ts`

## API Responses

### `WHOOP_SESSION_EXPIRED`

```json
{
  "error": "WHOOP_SESSION_EXPIRED",
  "message": "WHOOP session has expired. Please reconnect your account.",
  "reauthUrl": null
}
```

### `WHOOP_REAUTH_REQUIRED`

```json
{
  "error": "WHOOP_REAUTH_REQUIRED",
  "message": "WHOOP access has been revoked. Please re-authorize.",
  "cause": "token_revoked"
}
```

## Client Behavior (Expo App)

When Expo app receives `WHOOP_SESSION_EXPIRED` or `WHOOP_REAUTH_REQUIRED`:

1. Navigate to WHOOP authorization flow (re-call `/api/whoop/auth`)
2. User re-authorizes via WHOOP OAuth
3. Callback at `/api/auth/whoop/callback` stores new tokens
4. Original request can be retried

## Migration Steps

1. Create `whoop/errors.ts`
2. Create `whoop/token-manager.ts`
3. Create `whoop/client.ts`
4. Update `whoop/webhook.ts` to use `withValidToken`
5. Update `whoop/sync.ts` to use `withValidToken`
6. Update `index.ts` endpoint responses (`/api/whoop/status`, `/api/whoop/data`)
7. Create `whoop/index.ts` barrel export
8. Delete `whoop/token-rotation.ts`
9. Run `bun run check` to verify
10. Expo client: update WHOOP error handling to trigger re-auth flow

## Alternatives Considered

### 1. Keep `token-rotation.ts` for backward compatibility
**Rejected**: Having two token management modules creates confusion and drift. Cleaner to remove it.

### 2. Per-call-site 401 retry logic
**Rejected**: Scatter/gather pattern leads to inconsistent behavior. Centralized in `token-manager` ensures all call sites get retry.

### 3. Refresh tokens on every API call (eager refresh)
**Rejected**: WHOOP rate limits. Proactive refresh only when `< 24hrs` is sufficient buffer.
