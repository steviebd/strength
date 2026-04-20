import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { authClient } from '@/lib/auth-client';
import { Redirect } from 'expo-router';
import { QueryProvider } from '@/providers/QueryProvider';

export default function AppLayout() {
  const session = authClient.useSession();

  if (session.isPending) {
    return null;
  }

  if (!session.data) {
    return <Redirect href="/auth/sign-in?returnTo=/(app)/home" />;
  }

  return (
    <QueryProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#ef6f4f',
          tabBarInactiveTintColor: '#71717a',
          tabBarStyle: {
            backgroundColor: '#0a0a0a',
            borderTopColor: '#27272a',
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: () => <Text style={{ fontSize: 24 }}>🏠</Text>,
          }}
        />
        <Tabs.Screen
          name="workouts"
          options={{
            title: 'Workouts',
            tabBarIcon: () => <Text style={{ fontSize: 24 }}>💪</Text>,
          }}
        />
        <Tabs.Screen
          name="programs"
          options={{
            title: 'Programs',
            tabBarIcon: () => <Text style={{ fontSize: 24 }}>🔥</Text>,
          }}
        />
        <Tabs.Screen
          name="nutrition"
          options={{
            title: 'Nutrition',
            tabBarIcon: () => <Text style={{ fontSize: 24 }}>🥗</Text>,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: () => <Text style={{ fontSize: 24 }}>👤</Text>,
          }}
        />
      </Tabs>
    </QueryProvider>
  );
}
