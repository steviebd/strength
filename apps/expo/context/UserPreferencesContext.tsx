import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { isValidTimeZone } from '@strength/db/client';
import { getActiveTimezone, getCurrentDeviceTimezone } from '@/lib/timezone';
import {
  clearTimezoneDismissals,
  dismissTimezone,
  getLocalPreferences,
  hasDismissedTimezone,
  upsertLocalPreferences,
  type WeightUnit,
} from '@/db/preferences';
import type { DistanceUnit, HeightUnit } from '@/lib/units';
import type { LocalUserPreferences } from '@/db/local-schema';

type UserTimezone = string | null;

interface PreferencePayload {
  weightUnit?: WeightUnit;
  distanceUnit?: DistanceUnit;
  heightUnit?: HeightUnit;
  timezone?: UserTimezone;
  weightPromptedAt?: string | Date | null;
  bodyweightKg?: number | null;
  updatedAt?: string | Date | null;
}

interface UserPreferencesContextValue {
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  heightUnit: HeightUnit;
  timezone: UserTimezone;
  deviceTimezone: UserTimezone;
  activeTimezone: UserTimezone;
  bodyweightKg: number | null;
  needsTimezoneSelection: boolean;
  needsWeightSelection: boolean;
  showTimezoneMismatchModal: boolean;
  setWeightUnit: (unit: WeightUnit) => Promise<void>;
  setDistanceUnit: (unit: DistanceUnit) => Promise<void>;
  setHeightUnit: (unit: HeightUnit) => Promise<void>;
  setTimezone: (timezone: string) => Promise<void>;
  dismissTimezoneMismatchModal: () => Promise<void>;
  markWeightAsPrompted: () => Promise<void>;
  recordBodyweight: (bodyweightKg: number | null) => Promise<void>;
  refreshPreferences: () => Promise<void>;
  isLoading: boolean;
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

function parseDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function serializeDate(value: string | Date | null | undefined) {
  return parseDate(value)?.toISOString() ?? null;
}

function parseServerUpdatedAt(value: string | Date | null | undefined) {
  return parseDate(value)?.getTime() ?? 0;
}

function getValidTimezone(value: string | null | undefined) {
  return value && isValidTimeZone(value) ? value : null;
}

function hasMeaningfulLocalPreferences(prefs: LocalUserPreferences) {
  return Boolean(
    getValidTimezone(prefs.timezone) ||
    prefs.weightUnit !== 'kg' ||
    prefs.distanceUnit !== 'km' ||
    prefs.heightUnit !== 'cm' ||
    prefs.weightPromptedAt ||
    prefs.bodyweightKg !== null,
  );
}

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const currentUserId = session.data?.user?.id ?? null;
  const currentUserIdRef = useRef<string | null>(null);
  const latestServerUpdatedAtRef = useRef(0);

  const [weightUnit, setWeightUnitState] = useState<WeightUnit>('kg');
  const [distanceUnit, setDistanceUnitState] = useState<DistanceUnit>('km');
  const [heightUnit, setHeightUnitState] = useState<HeightUnit>('cm');
  const [timezone, setTimezoneState] = useState<UserTimezone>(null);
  const [deviceTimezone] = useState<UserTimezone>(() => getCurrentDeviceTimezone());
  const [hasPersistedTimezone, setHasPersistedTimezone] = useState(false);
  const [timezoneDismissed, setTimezoneDismissed] = useState<boolean | undefined>(undefined);
  const [showTimezoneMismatchModal, setShowTimezoneMismatchModal] = useState(false);
  const [weightPromptedAt, setWeightPromptedAtState] = useState<string | null>(null);
  const [bodyweightKg, setBodyweightKgState] = useState<number | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [serverPreferencesChecked, setServerPreferencesChecked] = useState(false);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  const applyPreferences = useCallback((payload: PreferencePayload, force = false) => {
    const incomingUpdatedAt = parseServerUpdatedAt(payload.updatedAt);
    if (!force && incomingUpdatedAt && incomingUpdatedAt < latestServerUpdatedAtRef.current) {
      return false;
    }

    const nextTimezone = getValidTimezone(payload.timezone ?? null);
    const nextWeightUnit = payload.weightUnit === 'lbs' ? 'lbs' : 'kg';
    const nextDistanceUnit = payload.distanceUnit === 'mi' ? 'mi' : 'km';
    const nextHeightUnit = payload.heightUnit === 'in' ? 'in' : 'cm';

    setWeightUnitState(nextWeightUnit);
    setDistanceUnitState(nextDistanceUnit);
    setHeightUnitState(nextHeightUnit);
    setTimezoneState(nextTimezone);
    setHasPersistedTimezone(Boolean(nextTimezone));
    setWeightPromptedAtState(serializeDate(payload.weightPromptedAt));
    setBodyweightKgState(payload.bodyweightKg ?? null);
    setShowTimezoneMismatchModal(true);

    if (incomingUpdatedAt) {
      latestServerUpdatedAtRef.current = incomingUpdatedAt;
    }

    return true;
  }, []);

  const persistServerPreferences = useCallback(
    async (userId: string, payload: PreferencePayload, force = false) => {
      const applied = applyPreferences(payload, force);
      if (!applied) {
        return;
      }

      const serverUpdatedAt = parseDate(payload.updatedAt);
      await upsertLocalPreferences(userId, {
        weightUnit: payload.weightUnit === 'lbs' ? 'lbs' : 'kg',
        distanceUnit: payload.distanceUnit === 'mi' ? 'mi' : 'km',
        heightUnit: payload.heightUnit === 'in' ? 'in' : 'cm',
        timezone: getValidTimezone(payload.timezone ?? null),
        weightPromptedAt: parseDate(payload.weightPromptedAt),
        bodyweightKg: payload.bodyweightKg ?? null,
        serverUpdatedAt,
        hydratedFromServerAt: new Date(),
      });
    },
    [applyPreferences],
  );

  const fetchAndPersistPreferences = useCallback(
    async (userId: string, force = false) => {
      const data = await apiFetch<PreferencePayload>('/api/profile/preferences');
      if (currentUserIdRef.current !== userId) {
        return;
      }
      await persistServerPreferences(userId, data, force);
      setServerPreferencesChecked(true);
    },
    [persistServerPreferences],
  );

  useEffect(() => {
    if (session.isPending) {
      return;
    }

    latestServerUpdatedAtRef.current = 0;
    setServerPreferencesChecked(false);

    if (!currentUserId) {
      setWeightUnitState('kg');
      setDistanceUnitState('km');
      setHeightUnitState('cm');
      setTimezoneState(deviceTimezone);
      setHasPersistedTimezone(false);
      setShowTimezoneMismatchModal(false);
      setWeightPromptedAtState(null);
      setBodyweightKgState(null);
      setLoadedUserId(null);
      setTimezoneDismissed(undefined);
      return;
    }

    let isActive = true;
    const userId = currentUserId;

    async function loadPreferences() {
      let hasLocalFastPath = false;

      try {
        const local = await getLocalPreferences(userId);
        if (!isActive || currentUserIdRef.current !== userId) {
          return;
        }

        if (local && hasMeaningfulLocalPreferences(local)) {
          hasLocalFastPath = true;
          const validTimezone = getValidTimezone(local.timezone);
          setWeightUnitState(local.weightUnit === 'lbs' ? 'lbs' : 'kg');
          setDistanceUnitState(local.distanceUnit === 'mi' ? 'mi' : 'km');
          setHeightUnitState(local.heightUnit === 'in' ? 'in' : 'cm');
          setTimezoneState(validTimezone);
          setHasPersistedTimezone(Boolean(validTimezone));
          setWeightPromptedAtState(local.weightPromptedAt?.toISOString() ?? null);
          setBodyweightKgState(local.bodyweightKg ?? null);
          setShowTimezoneMismatchModal(true);
          setLoadedUserId(userId);
          latestServerUpdatedAtRef.current = local.serverUpdatedAt?.getTime() ?? 0;
        }
      } catch {
        // Local SQLite is an optimization. D1 remains the fallback path.
      }

      try {
        await fetchAndPersistPreferences(userId);
      } catch {
        // Keep the local fast path if it worked; otherwise fall back to prompt state.
      } finally {
        if (isActive && currentUserIdRef.current === userId && !hasLocalFastPath) {
          setLoadedUserId(userId);
        }
      }
    }

    loadPreferences();

    return () => {
      isActive = false;
    };
  }, [currentUserId, deviceTimezone, fetchAndPersistPreferences, session.isPending]);

  useEffect(() => {
    if (!currentUserId || !deviceTimezone) {
      setTimezoneDismissed(false);
      return;
    }

    let isActive = true;
    setTimezoneDismissed(undefined);

    hasDismissedTimezone(currentUserId, deviceTimezone)
      .then((dismissed) => {
        if (isActive) {
          setTimezoneDismissed(dismissed);
        }
      })
      .catch(() => {
        if (isActive) {
          setTimezoneDismissed(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [currentUserId, deviceTimezone]);

  const setWeightUnit = useCallback(
    async (unit: WeightUnit) => {
      if (!session.data?.user) {
        return;
      }

      const userId = session.data.user.id;
      const previousUnit = weightUnit;
      setWeightUnitState(unit);
      try {
        const data = await apiFetch<PreferencePayload>('/api/profile/preferences', {
          method: 'PUT',
          body: { weightUnit: unit },
        });
        if (currentUserIdRef.current === userId) {
          await persistServerPreferences(userId, data, true);
          setServerPreferencesChecked(true);
        }
      } catch {
        setWeightUnitState(previousUnit);
      }
    },
    [persistServerPreferences, session.data?.user, weightUnit],
  );

  const setDistanceUnit = useCallback(
    async (unit: DistanceUnit) => {
      if (!session.data?.user) {
        return;
      }

      const userId = session.data.user.id;
      const previousUnit = distanceUnit;
      setDistanceUnitState(unit);
      try {
        const data = await apiFetch<PreferencePayload>('/api/profile/preferences', {
          method: 'PUT',
          body: { distanceUnit: unit },
        });
        if (currentUserIdRef.current === userId) {
          await persistServerPreferences(userId, data, true);
          setServerPreferencesChecked(true);
        }
      } catch {
        setDistanceUnitState(previousUnit);
      }
    },
    [persistServerPreferences, session.data?.user, distanceUnit],
  );

  const setHeightUnit = useCallback(
    async (unit: HeightUnit) => {
      if (!session.data?.user) {
        return;
      }

      const userId = session.data.user.id;
      const previousUnit = heightUnit;
      setHeightUnitState(unit);
      try {
        const data = await apiFetch<PreferencePayload>('/api/profile/preferences', {
          method: 'PUT',
          body: { heightUnit: unit },
        });
        if (currentUserIdRef.current === userId) {
          await persistServerPreferences(userId, data, true);
          setServerPreferencesChecked(true);
        }
      } catch {
        setHeightUnitState(previousUnit);
      }
    },
    [persistServerPreferences, session.data?.user, heightUnit],
  );

  const setTimezone = useCallback(
    async (nextTimezone: string) => {
      if (!session.data?.user || !isValidTimeZone(nextTimezone)) {
        return;
      }

      const userId = session.data.user.id;
      const previousTimezone = timezone;
      const previousPersistedState = hasPersistedTimezone;

      setTimezoneState(nextTimezone);
      setHasPersistedTimezone(true);
      setTimezoneDismissed(false);
      setShowTimezoneMismatchModal(false);

      try {
        const data = await apiFetch<PreferencePayload>('/api/profile/preferences', {
          method: 'PUT',
          body: { timezone: nextTimezone },
        });
        if (currentUserIdRef.current === userId) {
          await clearTimezoneDismissals(userId);
          await persistServerPreferences(userId, data, true);
          setServerPreferencesChecked(true);
          setTimezoneDismissed(false);
        }
      } catch {
        setTimezoneState(previousTimezone);
        setHasPersistedTimezone(previousPersistedState);
        setShowTimezoneMismatchModal(true);
      }
    },
    [hasPersistedTimezone, persistServerPreferences, session.data?.user, timezone],
  );

  const dismissTimezoneMismatchModal = useCallback(async () => {
    setShowTimezoneMismatchModal(false);
    setTimezoneDismissed(true);

    if (currentUserId && deviceTimezone) {
      await dismissTimezone(currentUserId, deviceTimezone);
    }
  }, [currentUserId, deviceTimezone]);

  const markWeightAsPrompted = useCallback(async () => {
    if (!session.data?.user) {
      return;
    }

    const userId = session.data.user.id;
    const previousPromptedAt = weightPromptedAt;
    const now = new Date().toISOString();
    setWeightPromptedAtState(now);
    try {
      const data = await apiFetch<PreferencePayload>('/api/profile/preferences', {
        method: 'PUT',
        body: { weightPromptedAt: now },
      });
      if (currentUserIdRef.current === userId) {
        await persistServerPreferences(userId, data, true);
        setServerPreferencesChecked(true);
      }
    } catch {
      setWeightPromptedAtState(previousPromptedAt);
    }
  }, [persistServerPreferences, session.data?.user, weightPromptedAt]);

  const recordBodyweight = useCallback(
    async (nextBodyweightKg: number | null) => {
      if (!session.data?.user) {
        return;
      }

      const userId = session.data.user.id;
      setBodyweightKgState(nextBodyweightKg);
      await upsertLocalPreferences(userId, { bodyweightKg: nextBodyweightKg });
    },
    [session.data?.user],
  );

  const refreshPreferences = useCallback(async () => {
    if (!session.data?.user) {
      return;
    }

    await fetchAndPersistPreferences(session.data.user.id, true);
  }, [fetchAndPersistPreferences, session.data?.user]);

  const isLoading = currentUserId !== null && loadedUserId !== currentUserId;
  const needsTimezoneSelection =
    Boolean(session.data?.user) && !isLoading && serverPreferencesChecked && !hasPersistedTimezone;
  const needsWeightSelection =
    Boolean(session.data?.user) &&
    !isLoading &&
    hasPersistedTimezone &&
    serverPreferencesChecked &&
    !weightPromptedAt &&
    bodyweightKg === null;
  const isTimezoneMismatch =
    hasPersistedTimezone &&
    timezone !== null &&
    deviceTimezone !== null &&
    timezone !== deviceTimezone;
  const activeTimezone = getActiveTimezone(timezone, deviceTimezone);

  return (
    <UserPreferencesContext.Provider
      value={{
        weightUnit,
        distanceUnit,
        heightUnit,
        timezone,
        deviceTimezone,
        activeTimezone,
        bodyweightKg,
        needsTimezoneSelection,
        needsWeightSelection,
        showTimezoneMismatchModal:
          isTimezoneMismatch && timezoneDismissed === false && showTimezoneMismatchModal,
        setWeightUnit,
        setDistanceUnit,
        setHeightUnit,
        setTimezone,
        dismissTimezoneMismatchModal,
        markWeightAsPrompted,
        recordBodyweight,
        refreshPreferences,
        isLoading,
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext);
  if (!context) {
    throw new Error('useUserPreferences must be used within UserPreferencesProvider');
  }
  return context;
}
