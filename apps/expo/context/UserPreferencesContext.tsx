import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { isValidTimeZone } from '@strength/db';

type WeightUnit = 'kg' | 'lbs';
type UserTimezone = string | null;

function detectDeviceTimeZone(): UserTimezone {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === 'string' && isValidTimeZone(timeZone) ? timeZone : null;
  } catch {
    return null;
  }
}

interface UserPreferencesContextValue {
  weightUnit: WeightUnit;
  timezone: UserTimezone;
  deviceTimezone: UserTimezone;
  needsTimezoneSelection: boolean;
  setWeightUnit: (unit: WeightUnit) => Promise<void>;
  setTimezone: (timezone: string) => Promise<void>;
  isLoading: boolean;
}

export const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const [weightUnit, setWeightUnitState] = useState<WeightUnit>('kg');
  const [timezone, setTimezoneState] = useState<UserTimezone>(null);
  const [deviceTimezone] = useState<UserTimezone>(() => detectDeviceTimeZone());
  const [hasPersistedTimezone, setHasPersistedTimezone] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (session.isPending) {
      return;
    }

    if (!session.data?.user) {
      setWeightUnitState('kg');
      setTimezoneState(deviceTimezone);
      setHasPersistedTimezone(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    apiFetch<{ weightUnit?: WeightUnit; timezone?: UserTimezone }>('/api/profile/preferences')
      .then((data) => {
        if (data.weightUnit) {
          setWeightUnitState(data.weightUnit);
        }

        if (data.timezone) {
          setTimezoneState(data.timezone);
          setHasPersistedTimezone(true);
          return;
        }

        setTimezoneState(deviceTimezone);
        setHasPersistedTimezone(false);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [deviceTimezone, session.data?.user, session.isPending]);

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
          body: JSON.stringify({ weightUnit: unit }),
        });
      } catch (error) {
        setWeightUnitState(previousUnit);
        console.error(error);
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

      try {
        await apiFetch('/api/profile/preferences', {
          method: 'PUT',
          body: JSON.stringify({ timezone: nextTimezone }),
        });
      } catch (error) {
        setTimezoneState(previousTimezone);
        setHasPersistedTimezone(previousPersistedState);
        console.error(error);
      }
    },
    [hasPersistedTimezone, session.data?.user, timezone],
  );

  const needsTimezoneSelection = Boolean(session.data?.user) && !isLoading && !hasPersistedTimezone;

  return (
    <UserPreferencesContext.Provider
      value={{
        weightUnit,
        timezone,
        deviceTimezone,
        needsTimezoneSelection,
        setWeightUnit,
        setTimezone,
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
