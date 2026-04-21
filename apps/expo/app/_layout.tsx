import '@/config/reanimated';
import { Stack } from 'expo-router';
import { QueryProvider } from '@/providers/QueryProvider';
import { UserPreferencesProvider } from '@/context/UserPreferencesContext';
import { WorkoutSessionProvider } from '@/context/WorkoutSessionContext';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <QueryProvider>
      <UserPreferencesProvider>
        <WorkoutSessionProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: colors.background,
              },
            }}
          >
            <Stack.Screen name="(app)" options={{ headerShown: false }} />
          </Stack>
        </WorkoutSessionProvider>
      </UserPreferencesProvider>
    </QueryProvider>
  );
}
