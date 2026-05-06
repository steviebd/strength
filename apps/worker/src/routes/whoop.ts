import { eq, and, gt, desc } from 'drizzle-orm';
import { whoopRecovery, whoopSleep, whoopCycle, whoopWorkout } from '@strength/db';
import { createRouter } from '../lib/router';
import { createHandler } from '../api/auth';
import { syncAllWhoopData } from '../whoop/sync';
import { isWhoopAuthError, toWhoopAuthErrorResponse } from '../whoop/errors';
import { getValidWhoopToken } from '../whoop/token-manager';
import {
  isWhoopConnected,
  whoopIntegrationExists,
  getWhoopUserId,
  getWhoopProfileByUserId,
} from '../whoop/user';
import { revokeWhoopIntegration } from '../whoop/token-rotation';
import {
  buildWhoopAuthorizationUrl,
  generateCodeChallenge,
  generateCodeVerifier,
} from '../whoop/auth';
import { resolveWorkerEnv } from '../auth';
import {
  encodeWhoopOAuthState,
  resolveWhoopRedirectBaseURL,
  isAllowedWhoopRedirectBaseURL,
} from '../lib/whoop-oauth';
import {
  parseJsonObject,
  getObject,
  getNumber,
  getTimestamp,
  withWhoopFallbacks,
} from '../lib/parsing';

const router = createRouter();

router.post(
  '/auth',
  createHandler(async (c, { userId, db }) => {
    const resolvedEnv = resolveWorkerEnv(c.env);

    const connected = await isWhoopConnected(db, userId);
    if (connected) {
      return c.json({ message: 'WHOOP already connected', connected: true }, 200);
    }

    if (!resolvedEnv.WHOOP_CLIENT_ID) {
      return c.json({ error: 'WHOOP_CLIENT_ID is missing from the worker environment' }, 500);
    }

    let returnTo: string | undefined;
    try {
      const body = await c.req.json<{ returnTo?: string }>();
      if (typeof body.returnTo === 'string' && body.returnTo.trim().length > 0) {
        returnTo = body.returnTo.trim();
      }
    } catch {}

    const baseURL = resolveWhoopRedirectBaseURL(resolvedEnv, c.req.url);
    if (!baseURL) {
      return c.json(
        { error: 'WORKER_BASE_URL is not configured and no request base URL was available' },
        500,
      );
    }
    if (!isAllowedWhoopRedirectBaseURL(baseURL)) {
      return c.json(
        {
          error: 'invalid_whoop_redirect_uri',
          message:
            'WHOOP requires an HTTPS redirect URI unless the host is localhost. Use an HTTPS tunnel for Expo Go on a physical device.',
          redirectUri: `${baseURL}/api/auth/whoop/callback`,
        },
        400,
      );
    }
    const redirectUri = `${baseURL}/api/auth/whoop/callback`;
    if (!resolvedEnv.BETTER_AUTH_SECRET) {
      return c.json({ error: 'BETTER_AUTH_SECRET is missing from the worker environment' }, 500);
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    const state = await encodeWhoopOAuthState(resolvedEnv.BETTER_AUTH_SECRET, {
      nonce: crypto.randomUUID(),
      userId,
      codeVerifier,
      ...(returnTo ? { returnTo } : {}),
    });

    const authUrl = buildWhoopAuthorizationUrl(resolvedEnv, state, redirectUri, codeChallenge);

    return c.json({ authUrl, state, codeVerifier });
  }),
);

router.post(
  '/sync-all',
  createHandler(async (c, { userId, db }) => {
    const connected = await isWhoopConnected(db, userId);
    if (!connected) {
      const integrationExists = await whoopIntegrationExists(db, userId);
      if (!integrationExists) {
        return c.json(
          {
            error: 'WHOOP_NOT_CONNECTED',
            message: 'WHOOP not connected. Please connect your account.',
            reauthUrl: null,
          },
          401,
        );
      }
      return c.json(
        {
          error: 'WHOOP_SESSION_EXPIRED',
          message: 'WHOOP session has expired. Please reconnect your account.',
          reauthUrl: null,
        },
        401,
      );
    }

    const result = await syncAllWhoopData(db, c.env, userId, { isInitialSync: false });
    const authError = result.errors.find(
      (message) =>
        message.includes('WHOOP_SESSION_EXPIRED') ||
        message.includes('WHOOP_REAUTH_REQUIRED') ||
        message.includes('Please reconnect WHOOP') ||
        message.includes('Please re-authorize'),
    );
    if (authError) {
      return c.json(
        {
          error: 'WHOOP_REAUTH_REQUIRED',
          message: authError,
        },
        401,
      );
    }

    return c.json({
      success: result.errors.length === 0,
      ...result,
    });
  }),
);

router.get(
  '/status',
  createHandler(async (c, { userId, db }) => {
    const connected = await isWhoopConnected(db, userId);
    if (!connected) {
      return c.json({ connected: false });
    }

    try {
      await getValidWhoopToken(db, c.env, userId);

      const whoopUserId = await getWhoopUserId(db, userId);
      const profile = await getWhoopProfileByUserId(db, userId);

      return c.json({
        connected: true,
        whoopUserId,
        profile: profile
          ? {
              email: profile.email,
              firstName: profile.firstName,
              lastName: profile.lastName,
            }
          : null,
      });
    } catch (e) {
      if (isWhoopAuthError(e)) {
        return c.json({
          connected: false,
          ...toWhoopAuthErrorResponse(e),
        });
      }

      return c.json({ message: 'Failed to check WHOOP status' }, 500);
    }
  }),
);

router.get(
  '/data',
  createHandler(async (c, { userId, db }) => {
    const connected = await isWhoopConnected(db, userId);
    if (!connected) {
      const integrationExists = await whoopIntegrationExists(db, userId);
      if (!integrationExists) {
        return c.json(
          {
            error: 'WHOOP_NOT_CONNECTED',
            message: 'WHOOP not connected. Please connect your account.',
            reauthUrl: null,
          },
          401,
        );
      }
      return c.json(
        {
          error: 'WHOOP_SESSION_EXPIRED',
          message: 'WHOOP session has expired. Please reconnect your account.',
          reauthUrl: null,
        },
        401,
      );
    }

    const rawDays = parseInt(c.req.query('days') ?? '30', 10);
    const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    try {
      await getValidWhoopToken(db, c.env, userId);

      const [recovery, sleep, cycles, workouts] = await Promise.all([
        db
          .select()
          .from(whoopRecovery)
          .where(eq(whoopRecovery.userId, userId))
          .orderBy(desc(whoopRecovery.date))
          .limit(100),
        db
          .select()
          .from(whoopSleep)
          .where(and(eq(whoopSleep.userId, userId), gt(whoopSleep.start, since)))
          .orderBy(desc(whoopSleep.start))
          .limit(100),
        db
          .select()
          .from(whoopCycle)
          .where(and(eq(whoopCycle.userId, userId), gt(whoopCycle.start, since)))
          .orderBy(desc(whoopCycle.start))
          .limit(100),
        db
          .select()
          .from(whoopWorkout)
          .where(and(eq(whoopWorkout.userId, userId), gt(whoopWorkout.start, since)))
          .orderBy(desc(whoopWorkout.start))
          .limit(100),
      ]);

      const normalizedRecovery = recovery.map((row) => {
        const rawData = parseJsonObject(row.rawData);
        const score = getObject(rawData, 'score');
        const storedDate =
          row.date instanceof Date && !Number.isNaN(row.date.getTime()) ? row.date.getTime() : null;
        const fallbackDate =
          getTimestamp(rawData, 'created_at') ??
          getTimestamp(rawData, 'updated_at') ??
          (row.createdAt instanceof Date ? row.createdAt.getTime() : null);

        return withWhoopFallbacks(row, {
          date: new Date(storedDate ?? fallbackDate ?? Date.now()),
          recoveryScore: row.recoveryScore ?? getNumber(score, 'recovery_score'),
          hrvRmssdMilli: row.hrvRmssdMilli ?? getNumber(score, 'hrv_rmssd_milli'),
          restingHeartRate: row.restingHeartRate ?? getNumber(score, 'resting_heart_rate'),
        });
      });

      const filteredRecovery = normalizedRecovery.filter(
        (row) => row.date instanceof Date && row.date.getTime() > since.getTime(),
      );

      const normalizedSleep = sleep.map((row) => {
        const rawData = parseJsonObject(row.rawData);
        const score = getObject(rawData, 'score');
        const stageSummary = getObject(score, 'stage_summary');
        const sleepNeeded = getObject(score, 'sleep_needed');
        const lightSleep =
          row.lightSleepTimeMilli ?? getNumber(stageSummary, 'total_light_sleep_time_milli');
        const slowWaveSleep =
          row.slowWaveSleepTimeMilli ?? getNumber(stageSummary, 'total_slow_wave_sleep_time_milli');
        const remSleep =
          row.remSleepTimeMilli ?? getNumber(stageSummary, 'total_rem_sleep_time_milli');
        const fallbackTotalSleepTime = [lightSleep, slowWaveSleep, remSleep].reduce<number>(
          (sum, value) => sum + (value ?? 0),
          0,
        );
        const totalSleepTime = row.totalSleepTimeMilli ?? fallbackTotalSleepTime;

        return withWhoopFallbacks(row, {
          sleepPerformancePercentage:
            row.sleepPerformancePercentage ?? getNumber(score, 'sleep_performance_percentage'),
          totalSleepTimeMilli: totalSleepTime > 0 ? totalSleepTime : null,
          sleepEfficiencyPercentage:
            row.sleepEfficiencyPercentage ?? getNumber(score, 'sleep_efficiency_percentage'),
          slowWaveSleepTimeMilli: slowWaveSleep,
          remSleepTimeMilli: remSleep,
          lightSleepTimeMilli: lightSleep,
          wakeTimeMilli: row.wakeTimeMilli ?? getNumber(stageSummary, 'total_awake_time_milli'),
          disturbanceCount: row.disturbanceCount ?? getNumber(stageSummary, 'disturbance_count'),
          sleepConsistencyPercentage:
            row.sleepConsistencyPercentage ?? getNumber(score, 'sleep_consistency_percentage'),
          sleepNeedBaselineMilli:
            row.sleepNeedBaselineMilli ?? getNumber(sleepNeeded, 'baseline_milli'),
          sleepNeedFromSleepDebtMilli:
            row.sleepNeedFromSleepDebtMilli ?? getNumber(sleepNeeded, 'need_from_sleep_debt_milli'),
          sleepNeedFromRecentStrainMilli:
            row.sleepNeedFromRecentStrainMilli ??
            getNumber(sleepNeeded, 'need_from_recent_strain_milli'),
          sleepNeedFromRecentNapMilli:
            row.sleepNeedFromRecentNapMilli ?? getNumber(sleepNeeded, 'need_from_recent_nap_milli'),
          respiratoryRate: getNumber(score, 'respiratory_rate'),
        });
      });

      const normalizedCycles = cycles.map((row) => {
        const rawData = parseJsonObject(row.rawData);
        const score = getObject(rawData, 'score');

        return withWhoopFallbacks(row, {
          dayStrain: row.dayStrain ?? getNumber(score, 'strain'),
          averageHeartRate: row.averageHeartRate ?? getNumber(score, 'average_heart_rate'),
          maxHeartRate: row.maxHeartRate ?? getNumber(score, 'max_heart_rate'),
          kilojoule: row.kilojoule ?? getNumber(score, 'kilojoule'),
        });
      });

      const seenCycleIds = new Set<string>();
      const uniqueCyclesById = normalizedCycles.filter((c) => {
        if (seenCycleIds.has(c.whoopCycleId)) return false;
        seenCycleIds.add(c.whoopCycleId);
        return true;
      });

      const normalizedWorkouts = workouts.map((row) => {
        const score = parseJsonObject(row.score);
        const kilojoule = getNumber(score, 'kilojoule');

        return withWhoopFallbacks(row, {
          strain: getNumber(score, 'strain'),
          averageHeartRate: getNumber(score, 'average_heart_rate'),
          maxHeartRate: getNumber(score, 'max_heart_rate'),
          kilojoule,
          caloriesKcal: kilojoule != null ? Math.round(kilojoule / 4.184) : null,
        } as Partial<typeof row> & {
          strain: number | null;
          averageHeartRate: number | null;
          maxHeartRate: number | null;
          kilojoule: number | null;
          caloriesKcal: number | null;
        });
      });

      return c.json({
        recovery: filteredRecovery,
        sleep: normalizedSleep,
        cycles: uniqueCyclesById,
        workouts: normalizedWorkouts,
      });
    } catch (e) {
      if (isWhoopAuthError(e)) {
        return c.json(toWhoopAuthErrorResponse(e), 401);
      }

      return c.json({ message: 'Failed to fetch WHOOP data' }, 500);
    }
  }),
);

router.post(
  '/disconnect',
  createHandler(async (c, { userId, db }) => {
    await revokeWhoopIntegration(db, userId);
    return c.json({ success: true });
  }),
);

export default router;
