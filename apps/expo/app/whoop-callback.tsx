import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { View, Text, Platform } from 'react-native';
import { colors, typography } from '@/theme';

export default function WhoopCallback() {
  const router = useRouter();
  const { success, error } = useLocalSearchParams<{
    success?: string;
    error?: string;
  }>();

  useEffect(() => {
    if (Platform.OS !== 'web') {
      const dismissResult = WebBrowser.dismissBrowser();
      if (dismissResult && typeof dismissResult.then === 'function') {
        dismissResult.catch(() => {});
      }
    }

    if (success === 'true') {
      router.replace({
        pathname: '/(app)/profile',
        params: { whoop: 'connected', focus: 'whoop' },
      });
      return;
    }

    router.replace({
      pathname: '/(app)/profile',
      params: typeof error === 'string' ? { error } : { error: 'whoop_auth_failed' },
    });
  }, [error, router, success]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
      }}
    >
      <Text style={{ color: colors.text, fontSize: typography.fontSizes.lg }}>
        Connecting WHOOP...
      </Text>
    </View>
  );
}
