import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { colors } from '@/theme';
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accentSecondary} />
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
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>App configuration error</Text>
      <Text style={styles.errorText}>
        {message}. Rebuild the APK with the staging Infisical environment.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  errorTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
