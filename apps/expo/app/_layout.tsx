import '@/config/reanimated';
import { Stack } from 'expo-router';
import { QueryProvider } from '@/providers/QueryProvider';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <QueryProvider>
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
    </QueryProvider>
  );
}
