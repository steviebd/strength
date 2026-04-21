import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { authClient } from '@/lib/auth-client';

export default function HomeScreen() {
  const session = authClient.useSession();

  if (session.isPending) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0a0a0a',
        }}
      >
        <ActivityIndicator size="large" color="#1f4d3c" />
      </View>
    );
  }

  if (!session.data) {
    return <Redirect href="/auth/sign-in?returnTo=/(app)/home" />;
  }

  return <Redirect href="/(app)/home" />;
}
