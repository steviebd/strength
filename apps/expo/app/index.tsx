import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { authClient } from '@/lib/auth-client';

export default function HomeScreen() {
  const session = authClient.useSession();

  if (session.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-sand">
        <ActivityIndicator size="large" color="#1f4d3c" />
      </View>
    );
  }

  if (!session.data) {
    return <Redirect href="/auth/sign-in?returnTo=/(app)/home" />;
  }

  return <Redirect href="/(app)/home" />;
}
