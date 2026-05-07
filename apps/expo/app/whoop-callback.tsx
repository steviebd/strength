import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { View, Text, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, typography } from '@/theme';
import { apiFetch } from '@/lib/api';

interface WhoopStatus {
  connected: boolean;
}

export default function WhoopCallback() {
  const router = useRouter();
  const { success, error } = useLocalSearchParams<{
    success?: string;
    error?: string;
  }>();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      const dismissResult = WebBrowser.dismissBrowser();
      if (dismissResult && typeof dismissResult.then === 'function') {
        dismissResult.catch(() => {});
      }
    }

    if (success !== 'true') {
      router.replace({
        pathname: '/(app)/profile',
        params: typeof error === 'string' ? { error } : { error: 'whoop_auth_failed' },
      });
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 30;

    const poll = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const status = await apiFetch<WhoopStatus>('/api/whoop/status');
        if (cancelled) return;
        if (status.connected) {
          router.replace({
            pathname: '/(app)/profile',
            params: { whoop: 'connected', focus: 'whoop' },
          });
          return;
        }
      } catch {
        // ignore individual poll failures
      }
      if (cancelled) return;
      if (attempts < maxAttempts) {
        setTimeout(poll, 2000);
      } else {
        setTimedOut(true);
        setTimeout(() => {
          if (!cancelled) {
            router.replace({
              pathname: '/(app)/profile',
              params: { error: 'whoop_connection_timeout' },
            });
          }
        }, 3000);
      }
    };

    setTimeout(poll, 1500);

    return () => {
      cancelled = true;
    };
  }, [error, router, success]);

  if (timedOut) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorIcon}>!</Text>
        <Text style={styles.errorText}>Connection timed out</Text>
        <Text style={styles.subtitle}>
          Please check your WHOOP account settings. Redirecting to profile...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.accentSecondary} />
      <Text style={styles.title}>Connecting your WHOOP account...</Text>
      <Text style={styles.subtitle}>This may take a moment</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: 16,
    paddingHorizontal: 32,
  },
  title: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    textAlign: 'center',
  },
  errorIcon: {
    color: colors.error,
    fontSize: 48,
    fontWeight: 'bold',
  },
  errorText: {
    color: colors.error,
    fontSize: typography.fontSizes.base,
    textAlign: 'center',
  },
});
