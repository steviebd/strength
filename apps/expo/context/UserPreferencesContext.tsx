import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api';

type WeightUnit = 'kg' | 'lbs';

interface UserPreferencesContextValue {
  weightUnit: WeightUnit;
  setWeightUnit: (unit: WeightUnit) => Promise<void>;
  isLoading: boolean;
}

export const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const [weightUnit, setWeightUnitState] = useState<WeightUnit>('kg');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ weightUnit: WeightUnit }>('/api/profile/preferences')
      .then((data) => {
        if (data.weightUnit) {
          setWeightUnitState(data.weightUnit);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const setWeightUnit = useCallback(
    async (unit: WeightUnit) => {
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
    [weightUnit],
  );

  return (
    <UserPreferencesContext.Provider value={{ weightUnit, setWeightUnit, isLoading }}>
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
