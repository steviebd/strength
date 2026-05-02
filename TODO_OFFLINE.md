# Offline Mode & UX Improvement TODO

## Architecture Overview

### Storage Layers

| Layer | Used For | Tech |
|-------|----------|------|
| **Platform Storage** (`lib/platform-storage.ts`) | Auth tokens (Better Auth), pending workouts | SecureStore (native) / localStorage (web) |
| **AsyncStorage** (`lib/storage.ts`) | Nutrition chat messages, drafts, pending images | `@react-native-async-storage/async-storage` |
| **Local SQLite** (`db/client.ts`, `db/local-schema.ts`) | Workouts, exercises, sets, templates, program cycles, nutrition summaries, body stats, WHOOP data, sync queue, preferences | `expo-sqlite` + Drizzle ORM |

### React Query Setup

`providers/QueryProvider.tsx` has a **very minimal** configuration:
- `staleTime: 60 * 1000`
- `refetchOnWindowFocus: false`
- **No query persistence**
- **No offline/retry customization**
- **No network status integration**

---

## Offline Support by Area

| Area | Read Offline | Write Offline | Sync Queue | Notes |
|------|-------------|---------------|------------|-------|
| **Workouts** | Full (SQLite) | Full | Yes | Best-in-class. Local CRUD + `sync_queue` table with exponential backoff retry (15s -> 1h). Conflict/failed states shown in UI with retry buttons. |
| **Templates** | Cache-first | No | No | Reads from SQLite first, then fetches fresh. But create/update/delete mutations fail immediately when offline. |
| **Programs / Schedule** | Cache-first | No | No | Same read pattern. Starting/rescheduling workouts requires network. |
| **Home Summary** | Fallback | N/A | N/A | Falls back to `buildLocalHomeSummary()` from SQLite when API fails. |
| **Nutrition Summary** | Cache-first | No | No | Daily summary cached in SQLite. But saving/deleting meals fails offline. |
| **Nutrition Chat** | Partial | No | No | Drafts and recent messages persist in AsyncStorage, but **sending** requires network. No message queue. |
| **Body Stats** | Cache-first | Optimistic | No | Cached in SQLite. Mutations revert on failure if offline. |
| **WHOOP** | Cache-first | N/A | N/A | Cached with 15-min staleness check. |
| **Preferences** | Fast-path | Optimistic | No | Local SQLite fast-path on app open. Mutations revert on failure. |

---

## Gaps & Improvement Opportunities

### 1. No Global Network Awareness

- `expo-network` is installed but **completely unused**.
- The app does not know when the device is offline. It just lets requests fail.
- **Action**: Add a `useNetworkStatus` hook with `expo-network`.
  - Show an offline banner/toast.
  - Skip unnecessary API calls.
  - Trigger a bulk sync when connectivity returns.

---

### 2. No Unified Offline Mutation Queue (Only Workouts Have One)

- Workout completions use `sync_queue` + `runWorkoutSync()`. Nothing else does.
- Nutrition meal saves, template edits, bodyweight updates, and program starts all fail immediately when offline.
- **Action**: Expand the sync queue pattern to other domains, or build a generic offline mutation queue that works with React Query.

---

### 3. No Unified Offline Query Helper (React Query Persistence Rejected)

- On cold start, every screen refetches from the network even though SQLite has the data.
- The "cache-first" pattern is manually reimplemented in every hook (`useTemplates`, `usePrograms`, `useProgramSchedule`, `useHomeSummary`, etc.).
- **Why not `@tanstack/react-query-persist-client`?**
  - There is no official or widely-used Expo/React Native SQLite persister. We would have to write our own (~20 lines), but it stores React Query's *entire dehydrated cache as one JSON blob*.
  - This creates **two cache layers** for the same data — our granular relational SQLite tables (`local_workouts`, `local_templates`, etc.) **and** the opaque RQ cache blob. They can drift out of sync.
- **Action**: Build a single `useOfflineQuery` hook that reads from our existing SQLite tables and skips the API when offline.
  - Example pattern:
    ```ts
    useOfflineQuery({
      queryKey: ['templates', userId],
      apiFn: () => apiFetch('/api/templates'),
      cacheFn: () => getCachedTemplates(userId),
      writeCacheFn: (data) => cacheTemplates(userId, data),
    })
    ```
  - This keeps our **single source of truth** in the relational SQLite schema that our sync queue already depends on.

---

### 4. Inconsistent Storage Abstraction

- `lib/storage.ts` uses `platformStorage` for pending workouts and chat messages, but `AsyncStorage` directly for nutrition pending images.
- **Action**: Unify everything through `platformStorage` or the SQLite layer.

---

### 5. No Cache Expiration / Cleanup

- Local SQLite tables grow indefinitely. Old nutrition daily summaries, WHOOP data, and chat messages are never purged.
- **Action**: Add TTL-based cleanup on hydration. For example:
  - Delete nutrition summaries older than 7 days.
  - Delete WHOOP data older than 7 days.
  - Limit chat message history stored in AsyncStorage.

---

### 6. Race Conditions in Background Refreshes

- Several screens fire `apiFetch().then(() => cache + setQueryData())` without proper cancellation or conflict resolution.
- If a user edits data offline and then a background refresh fires later when online, server data could overwrite local changes.
- **Action**: Use React Query's built-in `queryFn` invalidation pattern instead of manual `setQueryData` side-effects. Ensure dirty/local-only rows are never overwritten by hydration.

---

### 7. Workout Discard Fails Partially Offline

- `discardWorkout` in `useWorkoutSession.ts` deletes locally **and** calls `apiFetch('/api/workouts/${id}', { method: 'DELETE' })`.
- If offline, the local data is gone but the server record remains. On next sync, it could reappear.
- **Action**: Enqueue delete operations in the sync queue, or only mark as `isDeleted` locally until synced.

---

### 8. `hydrateTrainingCache` Has Aggressive Debounce

- The 60-second cooldown means switching apps quickly can serve very stale data.
- **Action**: Reduce the cooldown (e.g., to 10s) or track a "last hydrated at" timestamp per entity.

---

### 9. Missing Offline UX Indicators

- No visual cue that the app is offline or that data is pending sync.
- Failed workout syncs only show inside the workout history card. Other failures just show `Alert.alert()`.
- **Action**:
  - Add a small connectivity banner.
  - Show a pending-sync badge on tabs.
  - Use toast notifications for "Saved locally, will sync when online."

---

### 10. Auth Pages Do Not Queue

- Sign in/up fail with `Alert.alert()` when offline.
- **Action**: Cache credentials and auto-retry.

---

