import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authClient } from '@/lib/auth-client';
import { Redirect } from 'expo-router';
import { QueryProvider } from '@/providers/QueryProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { TimezonePickerModal } from '@/components/profile/TimezonePickerModal';

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

export default function AppLayout() {
  const session = authClient.useSession();
  const insets = useSafeAreaInsets();
  const { isLoading, needsTimezoneSelection, timezone, deviceTimezone, setTimezone } =
    useUserPreferences();

  if (session.isPending || session.isRefetching) {
    return null;
  }

  if (!session.data) {
    return <Redirect href="/auth/sign-in?returnTo=/(app)/home" />;
  }

  return (
    <QueryProvider>
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
              height: insets.bottom + 72,
              paddingTop: 8,
              paddingBottom: Math.max(insets.bottom, 10),
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
      </>
    </QueryProvider>
  );
}
