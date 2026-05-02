import { Redirect } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import LandingPage from './landing';

export default function HomeScreen() {
  if (env.configError) {
    return <ConfigurationError message={env.configError} />;
  }

  return <AuthenticatedRedirect />;
}

function AuthenticatedRedirect() {
  const session = authClient.useSession();

  if (session.isPending || session.isRefetching) {
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
    return <LandingPage />;
  }

  return <Redirect href="/(app)/home" />;
}

function ConfigurationError({ message }: { message: string }) {
  return (
    <View
      style={{
        flex: 1,
        gap: 12,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: '#0a0a0a',
      }}
    >
      <Text style={{ color: '#f5f5f5', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>
        App configuration error
      </Text>
      <Text style={{ color: '#a3a3a3', fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
        {message}. Rebuild the APK with the staging Infisical environment.
      </Text>
    </View>
  );
}
