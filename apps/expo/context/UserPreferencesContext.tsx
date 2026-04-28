import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { isValidTimeZone } from '@strength/db';
import { getActiveTimezone, getCurrentDeviceTimezone } from '@/lib/timezone';
import { getDismissedDeviceTimezone, setDismissedDeviceTimezone } from '@/lib/storage';

type WeightUnit = 'kg' | 'lbs';
type UserTimezone = string | null;

interface UserPreferencesContextValue {
  weightUnit: WeightUnit;
  timezone: UserTimezone;
  deviceTimezone: UserTimezone;
  activeTimezone: UserTimezone;
  needsTimezoneSelection: boolean;
  needsWeightSelection: boolean;
  showTimezoneMismatchModal: boolean;
  setWeightUnit: (unit: WeightUnit) => Promise<void>;
  setTimezone: (timezone: string) => Promise<void>;
  dismissTimezoneMismatchModal: () => Promise<void>;
  markWeightAsPrompted: () => Promise<void>;
  isLoading: boolean;
}

export const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const [weightUnit, setWeightUnitState] = useState<WeightUnit>('kg');
  const [timezone, setTimezoneState] = useState<UserTimezone>(null);
  const [deviceTimezone] = useState<UserTimezone>(() => getCurrentDeviceTimezone());
  const [hasPersistedTimezone, setHasPersistedTimezone] = useState(false);
  const [dismissedDeviceTimezone, setDismissedDeviceTimezoneState] = useState<string | null>(null);
  const [showTimezoneMismatchModal, setShowTimezoneMismatchModal] = useState(false);
  const [weightPromptedAt, setWeightPromptedAtState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getDismissedDeviceTimezone().then((val) => {
      setDismissedDeviceTimezoneState(val);
    });
  }, []);

  useEffect(() => {
    if (session.isPending) {
      return;
    }

    if (!session.data?.user) {
      setWeightUnitState('kg');
      setTimezoneState(deviceTimezone);
      setHasPersistedTimezone(false);
      setShowTimezoneMismatchModal(false);
      setWeightPromptedAtState(null);
      setIsLoading(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);

    apiFetch<{
      weightUnit?: WeightUnit;
      timezone?: UserTimezone;
      weightPromptedAt?: string | null;
    }>('/api/profile/preferences')
      .then((data) => {
        if (!isActive) {
          return;
        }

        const nextTimezone = data.timezone ?? null;

        setWeightUnitState(data.weightUnit ?? 'kg');
        setTimezoneState(nextTimezone);
        setHasPersistedTimezone(Boolean(nextTimezone));
        setWeightPromptedAtState(data.weightPromptedAt ?? null);

        if (nextTimezone) {
          const isMismatch = nextTimezone !== deviceTimezone;
          const needsPrompt =
            isMismatch &&
            (dismissedDeviceTimezone === null || dismissedDeviceTimezone !== deviceTimezone);
          setShowTimezoneMismatchModal(needsPrompt);
        } else {
          setShowTimezoneMismatchModal(false);
        }
      })
      .catch(() => {
        // no-op
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [deviceTimezone, dismissedDeviceTimezone, session.data?.user, session.isPending]);

  const setWeightUnit = useCallback(
    async (unit: WeightUnit) => {
      if (!session.data?.user) {
        return;
      }

      const previousUnit = weightUnit;
      setWeightUnitState(unit);
      try {
        await apiFetch('/api/profile/preferences', {
          method: 'PUT',
          body: { weightUnit: unit },
        });
      } catch {
        setWeightUnitState(previousUnit);
      }
    },
    [session.data?.user, weightUnit],
  );

  const setTimezone = useCallback(
    async (nextTimezone: string) => {
      if (!session.data?.user || !isValidTimeZone(nextTimezone)) {
        return;
      }

      const previousTimezone = timezone;
      const previousPersistedState = hasPersistedTimezone;

      setTimezoneState(nextTimezone);
      setHasPersistedTimezone(true);
      setDismissedDeviceTimezoneState(null);
      setDismissedDeviceTimezone(null);

      try {
        await apiFetch('/api/profile/preferences', {
          method: 'PUT',
          body: { timezone: nextTimezone },
        });
      } catch {
        setTimezoneState(previousTimezone);
        setHasPersistedTimezone(previousPersistedState);
      }
    },
    [hasPersistedTimezone, session.data?.user, timezone],
  );

  const dismissTimezoneMismatchModal = useCallback(async () => {
    setShowTimezoneMismatchModal(false);
    setDismissedDeviceTimezoneState(deviceTimezone);
    await setDismissedDeviceTimezone(deviceTimezone);
  }, [deviceTimezone]);

  const markWeightAsPrompted = useCallback(async () => {
    if (!session.data?.user) {
      return;
    }

    const now = new Date().toISOString();
    setWeightPromptedAtState(now);
    try {
      await apiFetch('/api/profile/preferences', {
        method: 'PUT',
        body: { weightPromptedAt: now },
      });
    } catch {
      setWeightPromptedAtState(null);
    }
  }, [session.data?.user]);

  const needsTimezoneSelection = Boolean(session.data?.user) && !isLoading && !hasPersistedTimezone;
  const needsWeightSelection =
    Boolean(session.data?.user) && !isLoading && hasPersistedTimezone && !weightPromptedAt;
  const isTimezoneMismatch =
    hasPersistedTimezone && timezone !== null && timezone !== deviceTimezone;
  const activeTimezone = getActiveTimezone(timezone, deviceTimezone);

  return (
    <UserPreferencesContext.Provider
      value={{
        weightUnit,
        timezone,
        deviceTimezone,
        activeTimezone,
        needsTimezoneSelection,
        needsWeightSelection,
        showTimezoneMismatchModal: isTimezoneMismatch && showTimezoneMismatchModal,
        setWeightUnit,
        setTimezone,
        dismissTimezoneMismatchModal,
        markWeightAsPrompted,
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
