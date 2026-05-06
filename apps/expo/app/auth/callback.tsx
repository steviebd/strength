import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { persistAuthCallbackCookie } from '@/lib/auth-callback-cookie';
import { nativeGoogleAuthReturnToKey } from '@/lib/auth-callback-url';
import { waitForSessionReady } from '@/lib/auth-session';
import { platformStorage } from '@/lib/platform-storage';
import { colors, typography } from '@/theme';

export default function AuthCallback() {
  const router = useRouter();
  const {
    returnTo,
    error: urlError,
    cookie,
  } = useLocalSearchParams<{
    returnTo?: string;
    error?: string;
    cookie?: string;
  }>();
  const [error, setError] = useState<string | null>(urlError ? decodeURIComponent(urlError) : null);

  useEffect(() => {
    if (error) return;

    let cancelled = false;

    (async () => {
      try {
        WebBrowser.dismissBrowser();
      } catch {}

      persistAuthCallbackCookie(cookie);

      const ready = await waitForSessionReady(5000);

      if (cancelled) return;

      if (ready) {
        const storedReturnTo = platformStorage.getItem(nativeGoogleAuthReturnToKey);
        platformStorage.removeItem(nativeGoogleAuthReturnToKey);
        router.replace((returnTo || storedReturnTo || '/(app)/home') as any);
      } else {
        setError('Unable to complete sign-in. Please try again.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [error, returnTo, router]);

  if (error) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
          paddingHorizontal: 24,
        }}
      >
        <View
          style={{
            borderRadius: 24,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: 24,
            width: '100%',
            maxWidth: 400,
          }}
        >
          <Text
            style={{
              fontSize: typography.fontSizes.xl,
              fontWeight: typography.fontWeights.bold,
              color: colors.text,
              marginBottom: 8,
            }}
          >
            Sign-in failed
          </Text>
          <Text
            style={{
              fontSize: typography.fontSizes.base,
              color: colors.textMuted,
              marginBottom: 24,
            }}
          >
            {error}
          </Text>
          <Pressable
            style={{
              backgroundColor: colors.accent,
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: 'center',
            }}
            onPress={() => router.replace('/auth/sign-in')}
          >
            <Text
              style={{
                fontSize: typography.fontSizes.base,
                fontWeight: typography.fontWeights.semibold,
                color: colors.text,
              }}
            >
              Back to Sign In
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator size="large" color={colors.accentSecondary} />
      <Text
        style={{
          color: colors.textMuted,
          fontSize: typography.fontSizes.base,
          marginTop: 16,
        }}
      >
        Completing sign-in...
      </Text>
    </View>
  );
}
