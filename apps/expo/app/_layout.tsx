import '@/config/reanimated';
import { Stack } from 'expo-router';
import { QueryProvider } from '@/providers/QueryProvider';
import { UserPreferencesProvider } from '@/context/UserPreferencesContext';
import { WorkoutSessionProvider } from '@/context/WorkoutSessionContext';
import '@/global.css';

export default function RootLayout() {
  return (
    <QueryProvider>
      <UserPreferencesProvider>
        <WorkoutSessionProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: '#0a0a0a',
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
