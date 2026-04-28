import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, View } from 'react-native';
import React, { Suspense } from 'react';
import { authClient } from '@/lib/auth-client';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { UserPreferencesProvider, useUserPreferences } from '@/context/UserPreferencesContext';
import { WorkoutSessionProvider } from '@/context/WorkoutSessionContext';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useTrainingSync } from '@/hooks/useTrainingSync';

const TimezonePickerModal = React.lazy(() =>
  import('@/components/profile/TimezonePickerModal').then((m) => ({
    default: m.TimezonePickerModal,
  })),
);
const WeightPickerModal = React.lazy(() =>
  import('@/components/profile/WeightPickerModal').then((m) => ({ default: m.WeightPickerModal })),
);

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

  const saveBodyweightMutation = useMutation({
    mutationFn: (bodyweightKg: number) =>
      apiFetch('/api/nutrition/body-stats', {
        method: 'POST',
        body: { bodyweightKg },
      }),
  });
  useTrainingSync();

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
              <Ionicons
                color={color}
                name={focused ? TAB_ICONS.home.active : TAB_ICONS.home.inactive}
                size={22}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="workouts"
          options={{
            title: TAB_ICONS.workouts.title,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                color={color}
                name={focused ? TAB_ICONS.workouts.active : TAB_ICONS.workouts.inactive}
                size={22}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="programs"
          options={{
            title: TAB_ICONS.programs.title,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                color={color}
                name={focused ? TAB_ICONS.programs.active : TAB_ICONS.programs.inactive}
                size={22}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="nutrition"
          options={{
            title: TAB_ICONS.nutrition.title,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                color={color}
                name={focused ? TAB_ICONS.nutrition.active : TAB_ICONS.nutrition.inactive}
                size={22}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: TAB_ICONS.profile.title,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                color={color}
                name={focused ? TAB_ICONS.profile.active : TAB_ICONS.profile.inactive}
                size={22}
              />
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

      <Suspense fallback={null}>
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
      </Suspense>

      <Suspense fallback={null}>
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
      </Suspense>

      <Suspense fallback={null}>
        <WeightPickerModal
          visible={!isLoading && needsWeightSelection}
          weightUnit={weightUnit}
          onSave={async (bodyweightKg) => {
            await saveBodyweightMutation.mutateAsync(bodyweightKg);
            await recordBodyweight(bodyweightKg);
            await markWeightAsPrompted();
          }}
          onSkip={markWeightAsPrompted}
          isSaving={saveBodyweightMutation.isPending}
        />
      </Suspense>
    </>
  );
}

export default function AppLayout() {
  const session = authClient.useSession();

  if (session.isPending && !session.data) {
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
    return <Redirect href="/auth/sign-in?returnTo=/(app)/home" />;
  }

  return (
    <UserPreferencesProvider>
      <WorkoutSessionProvider>
        <AppTabs />
      </WorkoutSessionProvider>
    </UserPreferencesProvider>
  );
}
