import { useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Link, router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AuthShell, AuthShellHandle } from '@/components/auth-shell';
import { buildAuthCallbackURL } from '@/lib/auth-callback-url';
import { authClient } from '@/lib/auth-client';
import { waitForSessionReady } from '@/lib/auth-session';
import { colors } from '@/theme';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isEmailSubmitting, setIsEmailSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const searchParams = useLocalSearchParams();
  const passwordRef = useRef<any>(null);
  const authShellRef = useRef<AuthShellHandle>(null);
  const emailInputRef = useRef<any>(null);
  const passwordInputRef = useRef<any>(null);
  const redirectUrl = (searchParams.returnTo as string) || '/(app)/home';

  useFocusEffect(
    useCallback(() => {
      setIsGoogleSubmitting(false);
    }, []),
  );

  async function handleSubmit() {
    setError(null);
    setIsEmailSubmitting(true);

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message ?? 'Unable to sign in.');
        return;
      }

      const ready = await waitForSessionReady();
      if (!ready) {
        setError('Unable to establish session. Please try again.');
        return;
      }
      router.replace(redirectUrl as any);
    } catch (error) {
      setError(
        error instanceof Error && error.message === 'Network request failed'
          ? 'Unable to reach the auth server. Confirm the Worker is running and EXPO_PUBLIC_WORKER_BASE_URL points at a reachable host.'
          : error instanceof Error
            ? error.message
            : 'Unable to sign in.',
      );
    } finally {
      setIsEmailSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setIsGoogleSubmitting(true);

    try {
      const callbackURL = buildAuthCallbackURL(redirectUrl);
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL,
        errorCallbackURL: callbackURL,
      });

      if (result.error) {
        setError(result.error.message ?? 'Unable to sign in with Google.');
        return;
      }

      const ready = await waitForSessionReady();
      if (!ready) {
        setError('Sign-in was not completed. Please try again.');
        return;
      }
      router.replace(redirectUrl as any);
    } catch (error) {
      setError(
        error instanceof Error && error.message === 'Network request failed'
          ? 'Unable to reach the auth server. Confirm the Worker is running and EXPO_PUBLIC_WORKER_BASE_URL points at a reachable host.'
          : error instanceof Error
            ? error.message
            : 'Unable to sign in.',
      );
    } finally {
      setIsGoogleSubmitting(false);
    }
  }

  function scrollToInput(ref: React.RefObject<any>) {
    ref.current?.measure((_x: any, _y: any, _width: any, _height: any, _pageX: any, pageY: any) => {
      authShellRef.current?.scrollToInput(pageY);
    });
  }

  return (
    <AuthShell
      ref={authShellRef}
      eyebrow="Strength"
      title="Welcome back"
      subtitle="Sign in to continue your journey."
    >
      <View style={{ gap: 20 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '500', color: colors.textMuted }}>Email</Text>
          <View ref={emailInputRef} style={{ position: 'relative' }}>
            <Text
              style={{
                position: 'absolute',
                left: 16,
                top: 16,
                fontSize: 16,
                color: colors.textMuted,
              }}
            >
              🔒
            </Text>
            <TextInput
              testID="auth-sign-in-email"
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
                borderRadius: 12,
                paddingVertical: 16,
                paddingLeft: 48,
                paddingRight: 16,
                fontSize: 16,
                color: colors.text,
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={colors.placeholderText}
              value={email}
              onChangeText={setEmail}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => passwordRef.current?.focus()}
              onFocus={() => scrollToInput(emailInputRef)}
            />
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '500', color: colors.textMuted }}>Password</Text>
          <View ref={passwordInputRef} style={{ position: 'relative' }}>
            <Text
              style={{
                position: 'absolute',
                left: 16,
                top: 16,
                fontSize: 16,
                color: colors.textMuted,
              }}
            >
              🔒
            </Text>
            <TextInput
              testID="auth-sign-in-password"
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
                borderRadius: 12,
                paddingVertical: 16,
                paddingLeft: 48,
                paddingRight: 16,
                fontSize: 16,
                color: colors.text,
              }}
              secureTextEntry
              placeholder="Enter your password"
              placeholderTextColor={colors.placeholderText}
              value={password}
              onChangeText={setPassword}
              returnKeyType="done"
              blurOnSubmit={false}
              onSubmitEditing={handleSubmit}
              onFocus={() => scrollToInput(passwordInputRef)}
            />
          </View>
        </View>

        {error ? (
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(239, 68, 68, 0.2)',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <Text style={{ fontSize: 14, color: colors.error }}>{error}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text style={{ fontSize: 12, color: colors.textMuted }}>or</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        <Pressable
          testID="auth-sign-in-submit"
          accessibilityLabel="auth-sign-in-submit"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: '#4285F4',
            borderRadius: 12,
            paddingVertical: 16,
            opacity: isGoogleSubmitting ? 0.6 : 1,
          }}
          disabled={isGoogleSubmitting}
          onPress={handleGoogleSignIn}
        >
          {isGoogleSubmitting && <ActivityIndicator size="small" color="#ffffff" />}
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#ffffff' }}>
            {isGoogleSubmitting ? 'Signing in...' : 'Continue with Google'}
          </Text>
        </Pressable>

        <Pressable
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: colors.accent,
            borderRadius: 12,
            paddingVertical: 16,
            marginTop: 8,
            opacity: isEmailSubmitting ? 0.6 : 1,
          }}
          disabled={isEmailSubmitting}
          onPress={handleSubmit}
        >
          {isEmailSubmitting && <ActivityIndicator size="small" color="#ffffff" />}
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
            {isEmailSubmitting ? 'Signing in...' : 'Sign in'}
          </Text>
        </Pressable>

        <View style={{ flexDirection: 'row', justifyContent: 'center', paddingTop: 8 }}>
          <Text style={{ fontSize: 14, color: colors.textMuted }}>Don't have an account? </Text>
          <Link href="/auth/sign-up">
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>
              Create one
            </Text>
          </Link>
        </View>
      </View>
    </AuthShell>
  );
}
