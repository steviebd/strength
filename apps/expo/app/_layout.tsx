import '@/config/reanimated';
import { Stack } from 'expo-router';
import { QueryProvider } from '@/providers/QueryProvider';
import { colors } from '@/theme';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { syncOfflineQueueAndCache } from '@/lib/workout-sync';
import { authClient } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const SYNC_TASK = 'strength-sync';

TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    const session = await authClient.getSession();
    const userId = session?.data?.user?.id;
    if (!userId) return BackgroundTask.BackgroundTaskResult.Failed;

    await syncOfflineQueueAndCache(userId);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export default function RootLayout() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    authClient.getSession().then((session) => {
      setUserId(session?.data?.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const status = await BackgroundTask.getStatusAsync();
      if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
        return;
      }
      const isRegistered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK);
      if (!isRegistered) {
        await BackgroundTask.registerTaskAsync(SYNC_TASK, {
          minimumInterval: 15 * 60, // 15 minutes
        });
      }
    })().catch(() => {});
  }, [userId]);

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
