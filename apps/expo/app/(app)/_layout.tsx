import { Tabs } from 'expo-router';
import { ActivityIndicator, View, AppState } from 'react-native';
import { authClient } from '@/lib/auth-client';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { UserPreferencesProvider, useUserPreferences } from '@/context/UserPreferencesContext';
import { WorkoutSessionProvider } from '@/context/WorkoutSessionContext';
import { FirstSyncGate } from '@/components/FirstSyncGate';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { OfflineError, tryOnlineOrEnqueue } from '@/lib/offline-mutation';
import { getLocalDb } from '@/db/client';
import { localBodyStats } from '@/db/local-schema';
import { useTrainingSync } from '@/hooks/useTrainingSync';
import { TabIconWithBadge } from '@/components/TabIconWithBadge';
import { TimezonePickerModal } from '@/components/profile/TimezonePickerModal';
import { WeightPickerModal } from '@/components/profile/WeightPickerModal';
import { useEffect, useState, useRef } from 'react';

const TAB_ICONS = {
  home: {
    active: 'home',
    inactive: 'home-outline',
    title: 'Home',
  },
  workouts: {
    active: 'barbell',
    inactive: 'barbell-outline',
    title: 'Workouts',
  },
  programs: {
    active: 'flash',
    inactive: 'flash-outline',
    title: 'Programs',
  },
  nutrition: {
    active: 'restaurant',
    inactive: 'restaurant-outline',
    title: 'Nutrition',
  },
  profile: {
    active: 'person',
    inactive: 'person-outline',
    title: 'Profile',
  },
} as const;

function AppTabs() {
  const insets = useSafeAreaInsets();
  const {
    isLoading,
    needsTimezoneSelection,
    needsWeightSelection,
    timezone,
    deviceTimezone,
    setTimezone,
    showTimezoneMismatchModal,
    dismissTimezoneMismatchModal,
    weightUnit,
    markWeightAsPrompted,
    recordBodyweight,
  } = useUserPreferences();

  const [offlineMessage, setOfflineMessage] = useState<string | null>(null);

  const saveBodyweightMutation = useMutation({
    mutationFn: async (bodyweightKg: number) => {
      if (!userId) throw new Error('Not authenticated');
      return tryOnlineOrEnqueue({
        apiCall: () =>
          apiFetch('/api/nutrition/body-stats', {
            method: 'POST',
            body: { bodyweightKg },
          }),
        userId,
        entityType: 'body_stats',
        operation: 'update_body_stats',
        entityId: userId,
        payload: { bodyweightKg },
        onEnqueue: async () => {
          const db = getLocalDb();
          if (!db) return;
          const now = new Date();
          db.insert(localBodyStats)
            .values({
              userId,
              bodyweightKg,
              recordedAt: now,
              hydratedAt: now,
            })
            .onConflictDoUpdate({
              target: localBodyStats.userId,
              set: {
                bodyweightKg,
                recordedAt: now,
              },
            })
            .run();
        },
      });
    },
  });
  useTrainingSync();

  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: {
            backgroundColor: colors.background,
          },
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: colors.accentSecondary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
            marginTop: 2,
          },
          tabBarItemStyle: {
            paddingTop: 4,
          },
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: insets.bottom + 56,
            paddingTop: 4,
            paddingBottom: Math.max(insets.bottom, 8),
            paddingHorizontal: 10,
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: TAB_ICONS.home.title,
            tabBarIcon: ({ color, focused }) => (
              <TabIconWithBadge icon={TAB_ICONS.home} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="workouts"
          options={{
            title: TAB_ICONS.workouts.title,
            tabBarIcon: ({ color, focused }) => (
              <TabIconWithBadge icon={TAB_ICONS.workouts} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="programs"
          options={{
            title: TAB_ICONS.programs.title,
            tabBarIcon: ({ color, focused }) => (
              <TabIconWithBadge icon={TAB_ICONS.programs} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="nutrition"
          options={{
            title: TAB_ICONS.nutrition.title,
            tabBarIcon: ({ color, focused }) => (
              <TabIconWithBadge icon={TAB_ICONS.nutrition} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: TAB_ICONS.profile.title,
            tabBarIcon: ({ color, focused }) => (
              <TabIconWithBadge icon={TAB_ICONS.profile} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="(program-detail)"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="(workout-detail)"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="whoop"
          options={{
            href: null,
          }}
        />
      </Tabs>

      <TimezonePickerModal
        visible={!isLoading && needsTimezoneSelection}
        title="Set your timezone"
        description="Choose the timezone your workouts, meals, and daily summaries should follow."
        confirmLabel={deviceTimezone ? `Use ${deviceTimezone}` : 'Continue'}
        selectedTimezone={deviceTimezone ?? timezone}
        onClose={() => {}}
        onConfirm={setTimezone}
        dismissLocked
        acceptFirst={Boolean(deviceTimezone)}
      />

      <TimezonePickerModal
        visible={showTimezoneMismatchModal}
        title="Timezone changed?"
        description="Your device timezone is different from your saved preference. Would you like to update it?"
        confirmLabel="Update timezone"
        selectedTimezone={deviceTimezone}
        onClose={dismissTimezoneMismatchModal}
        onConfirm={setTimezone}
        acceptFirst={true}
      />

      <WeightPickerModal
        visible={!isLoading && needsWeightSelection}
        weightUnit={weightUnit}
        onSave={async (bodyweightKg) => {
          try {
            await saveBodyweightMutation.mutateAsync(bodyweightKg);
            await recordBodyweight(bodyweightKg);
            await markWeightAsPrompted();
            setOfflineMessage(null);
          } catch (error) {
            if (error instanceof OfflineError || (error as any)?.name === 'OfflineError') {
              setOfflineMessage("Changes saved locally. Will sync when you're back online.");
              await recordBodyweight(bodyweightKg);
              await markWeightAsPrompted();
            } else {
              throw error;
            }
          }
        }}
        onSkip={markWeightAsPrompted}
        isSaving={saveBodyweightMutation.isPending}
        offlineMessage={offlineMessage}
      />
    </>
  );
}

export default function AppLayout() {
  const session = authClient.useSession();
  const hasEverHadSession = useRef(false);
  const hasTriedRecovery = useRef(false);
  const refreshCountRef = useRef(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (session.data) {
      hasEverHadSession.current = true;
      hasTriedRecovery.current = false;
    }
  }, [session.data]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshCountRef.current++;
        setIsRefreshing(true);
        authClient.getSession().finally(() => {
          if (--refreshCountRef.current <= 0) {
            refreshCountRef.current = 0;
            setIsRefreshing(false);
          }
        });
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (
      !session.data &&
      hasEverHadSession.current &&
      !session.isPending &&
      !hasTriedRecovery.current &&
      refreshCountRef.current === 0
    ) {
      hasTriedRecovery.current = true;
      refreshCountRef.current++;
      setIsRefreshing(true);
      authClient.getSession().finally(() => {
        if (--refreshCountRef.current <= 0) {
          refreshCountRef.current = 0;
          setIsRefreshing(false);
        }
      });
    }
  }, [session.data, session.isPending]);

  if ((session.isPending || isRefreshing) && !session.data) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.accentSecondary} />
      </View>
    );
  }

  if (!session.data) {
    return <Redirect href="/" />;
  }

  return (
    <UserPreferencesProvider>
      <WorkoutSessionProvider>
        <FirstSyncGate>
          <AppTabs />
        </FirstSyncGate>
      </WorkoutSessionProvider>
    </UserPreferencesProvider>
  );
}
