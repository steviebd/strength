import { useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Link, router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AuthShell, AuthShellHandle } from '@/components/auth-shell';
import { buildAuthCallbackURL, nativeGoogleAuthReturnToKey } from '@/lib/auth-callback-url';
import { authClient } from '@/lib/auth-client';
import { waitForSessionReady } from '@/lib/auth-session';
import { platformStorage } from '@/lib/platform-storage';
import { colors } from '@/theme';
import Svg, { Path } from 'react-native-svg';

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
      const isNetworkError = error instanceof Error && error.message === 'Network request failed';
      if (isNetworkError) {
        // Credentials are stored in platformStorage (SecureStore on native, localStorage on web).
        platformStorage.setItem(
          'auth_pending_signin',
          JSON.stringify({ email, password, timestamp: Date.now() }),
        );
        setError("You're offline. We'll sign you in automatically when you're back online.");
        return;
      }
      setError(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setIsEmailSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setIsGoogleSubmitting(true);

    try {
      const callbackURL = buildAuthCallbackURL(redirectUrl);
      platformStorage.setItem(nativeGoogleAuthReturnToKey, redirectUrl);
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
      platformStorage.removeItem(nativeGoogleAuthReturnToKey);
      router.replace(redirectUrl as any);
    } catch (error) {
      const isNetworkError = error instanceof Error && error.message === 'Network request failed';
      if (isNetworkError) {
        setError("You're offline. We'll sign you in automatically when you're back online.");
        return;
      }
      setError(error instanceof Error ? error.message : 'Unable to sign in.');
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

        <Pressable
          testID="auth-sign-in-submit"
          accessibilityLabel="auth-sign-in-submit"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: colors.accent,
            borderRadius: 12,
            paddingVertical: 16,
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

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text style={{ fontSize: 12, color: colors.textMuted }}>or</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        <Pressable
          testID="auth-sign-in-google"
          accessibilityLabel="auth-sign-in-google"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            paddingVertical: 16,
            opacity: isGoogleSubmitting ? 0.6 : 1,
          }}
          disabled={isGoogleSubmitting}
          onPress={handleGoogleSignIn}
        >
          {isGoogleSubmitting ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              />
              <Path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <Path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <Path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </Svg>
          )}
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
            {isGoogleSubmitting ? 'Signing in...' : 'Continue with Google'}
          </Text>
        </Pressable>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            flexWrap: 'wrap',
            paddingTop: 8,
          }}
        >
          <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center' }}>
            By signing in, you agree to our{' '}
          </Text>
          <Link href="/terms">
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.accent }}>
              Terms of Service
            </Text>
          </Link>
          <Text style={{ fontSize: 12, color: colors.textMuted }}> and </Text>
          <Link href="/privacy">
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.accent }}>
              Privacy Policy
            </Text>
          </Link>
          <Text style={{ fontSize: 12, color: colors.textMuted }}>.</Text>
        </View>

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
