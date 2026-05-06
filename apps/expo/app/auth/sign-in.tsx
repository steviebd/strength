import { useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Link, router } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AuthShell } from '@/components/auth-shell';
import { buildAuthCallbackURL, nativeGoogleAuthReturnToKey } from '@/lib/auth-callback-url';
import { authClient } from '@/lib/auth-client';
import { waitForSessionReady } from '@/lib/auth-session';
import { platformStorage } from '@/lib/platform-storage';
import { requestPasswordResetEmail } from '@/lib/password-reset';
import { sendVerificationEmailRequest } from '@/lib/verification-email';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';
import { colors, spacing, textRoles, surface, border, text } from '@/theme';
import Svg, { Path } from 'react-native-svg';
import { env } from '@/lib/env';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isEmailSubmitting, setIsEmailSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [isCheckingProvider, setIsCheckingProvider] = useState(false);
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [isEmailNotVerified, setIsEmailNotVerified] = useState(false);
  const searchParams = useLocalSearchParams();
  const passwordRef = useRef<any>(null);
  const redirectUrl = (searchParams.returnTo as string) || '/(app)/home';

  useFocusEffect(
    useCallback(() => {
      setIsGoogleSubmitting(false);
    }, []),
  );

  async function handleSubmit() {
    setError(null);
    setIsEmailNotVerified(false);
    setIsEmailSubmitting(true);

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        const errorMessage = result.error.message ?? 'Unable to sign in.';
        const errorCode = (result.error as any).code;

        // Check for unverified email
        if (
          errorCode === 'EMAIL_NOT_VERIFIED' ||
          errorMessage.toLowerCase().includes('email not verified') ||
          errorMessage.toLowerCase().includes('not verified')
        ) {
          setIsEmailNotVerified(true);
          setError(
            'Please verify your email before signing in. Check your inbox for a verification link.',
          );
          setIsEmailSubmitting(false);
          return;
        }

        // Proactive OAuth-only detection
        const normalizedEmail = email.trim().toLowerCase();
        if (normalizedEmail) {
          setIsCheckingProvider(true);
          try {
            const res = await fetch(`${env.apiUrl}/api/auth/check-email-provider`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: normalizedEmail }),
            });
            if (res.ok) {
              const data = (await res.json()) as { hasCredential: boolean; hasOAuth: boolean };
              if (data.hasCredential === false && data.hasOAuth === true) {
                setShowOAuthModal(true);
                setIsEmailSubmitting(false);
                setIsCheckingProvider(false);
                return;
              }
            }
          } catch {
            // fall through to standard error
          } finally {
            setIsCheckingProvider(false);
          }
        }

        setError(errorMessage);
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

  async function handleSetPasswordFromModal() {
    setIsRequestingReset(true);
    try {
      await requestPasswordResetEmail(email.trim());
      setShowOAuthModal(false);
      setError('Check your inbox for a password reset link.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reset email.');
    } finally {
      setIsRequestingReset(false);
    }
  }

  async function handleResendVerification() {
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setIsResendingVerification(true);
    try {
      await sendVerificationEmailRequest(email.trim());
      setError('Verification email sent. Check your inbox.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend verification email.');
    } finally {
      setIsResendingVerification(false);
    }
  }

  const isSubmitting = isEmailSubmitting || isCheckingProvider;
  const isSuccessError = error?.includes('Check your inbox');

  return (
    <AuthShell eyebrow="Strength" title="Welcome back" subtitle="Sign in to continue your journey.">
      <View style={{ gap: spacing.lg }}>
        <TextField
          testID="auth-sign-in-email"
          label="Email"
          leftIcon="mail-outline"
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => passwordRef.current?.focus()}
        />

        <TextField
          testID="auth-sign-in-password"
          ref={passwordRef}
          label="Password"
          leftIcon="lock-closed-outline"
          secureTextEntry
          placeholder="Enter your password"
          value={password}
          onChangeText={setPassword}
          returnKeyType="done"
          blurOnSubmit={false}
          onSubmitEditing={handleSubmit}
        />

        <View style={{ alignItems: 'flex-end' }}>
          <Link href={'/auth/forgot-password' as any}>
            <Text style={{ ...textRoles.bodySmall, color: colors.accent, fontWeight: '500' }}>
              Forgot password?
            </Text>
          </Link>
        </View>

        {error ? (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: isSuccessError ? border.success : border.danger,
              backgroundColor: isSuccessError ? surface.success : surface.danger,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              gap: spacing.sm,
            }}
          >
            <Text
              style={{
                ...textRoles.bodySmall,
                color: isSuccessError ? text.success : text.danger,
              }}
            >
              {error}
            </Text>
            {isEmailNotVerified ? (
              <Pressable
                onPress={handleResendVerification}
                disabled={isResendingVerification}
                style={{ alignSelf: 'flex-start' }}
              >
                <Text
                  style={{
                    ...textRoles.bodySmall,
                    color: colors.accent,
                    fontWeight: '600',
                    opacity: isResendingVerification ? 0.6 : 1,
                  }}
                >
                  {isResendingVerification ? 'Sending...' : 'Resend verification email'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Button
          testID="auth-sign-in-submit"
          label={isSubmitting ? 'Signing in...' : 'Sign in'}
          variant="primary"
          size="md"
          fullWidth
          loading={isSubmitting}
          disabled={isSubmitting}
          onPress={handleSubmit}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text style={{ ...textRoles.caption, color: colors.textMuted }}>or</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        <Button
          testID="auth-sign-in-google"
          variant="outline"
          size="md"
          fullWidth
          disabled={isGoogleSubmitting}
          onPress={handleGoogleSignIn}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {isGoogleSubmitting ? (
              <ActivityIndicator size="small" color={text.primary} />
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
            <Text style={{ ...textRoles.button, color: text.primary }}>
              {isGoogleSubmitting ? 'Signing in...' : 'Continue with Google'}
            </Text>
          </View>
        </Button>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            flexWrap: 'wrap',
            paddingTop: spacing.sm,
          }}
        >
          <Text style={{ ...textRoles.caption, color: colors.textMuted, textAlign: 'center' }}>
            By signing in, you agree to our{' '}
          </Text>
          <Link href="/terms">
            <Text style={{ ...textRoles.caption, color: colors.accent, fontWeight: '600' }}>
              Terms of Service
            </Text>
          </Link>
          <Text style={{ ...textRoles.caption, color: colors.textMuted }}> and </Text>
          <Link href="/privacy">
            <Text style={{ ...textRoles.caption, color: colors.accent, fontWeight: '600' }}>
              Privacy Policy
            </Text>
          </Link>
          <Text style={{ ...textRoles.caption, color: colors.textMuted }}>.</Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', paddingTop: spacing.sm }}>
          <Text style={{ ...textRoles.body, color: colors.textMuted }}>
            Don't have an account?{' '}
          </Text>
          <Link href="/auth/sign-up">
            <Text style={{ ...textRoles.body, color: colors.accent, fontWeight: '600' }}>
              Create one
            </Text>
          </Link>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', paddingTop: spacing.xs }}>
          <Link href={'/auth/forgot-password' as any}>
            <Text style={{ ...textRoles.body, color: colors.accent, fontWeight: '500' }}>
              Forgot password?
            </Text>
          </Link>
        </View>
      </View>

      {/* Proactive OAuth-only detection modal */}
      <Modal
        visible={showOAuthModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOAuthModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.7)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing.lg,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: colors.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.lg,
              gap: spacing.md,
            }}
          >
            <Text
              style={{
                ...textRoles.sectionTitle,
                color: colors.text,
                textAlign: 'center',
              }}
            >
              Sign in with Google
            </Text>
            <Text
              style={{
                ...textRoles.body,
                color: colors.textMuted,
                textAlign: 'center',
              }}
            >
              You originally signed up with Google. To sign in with your email and password, you
              first need to set a password.
            </Text>

            <Button
              label={isRequestingReset ? 'Sending...' : 'Set Password'}
              variant="primary"
              size="md"
              fullWidth
              loading={isRequestingReset}
              disabled={isRequestingReset}
              onPress={handleSetPasswordFromModal}
            />

            <Button variant="outline" size="md" fullWidth onPress={handleGoogleSignIn}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
                <Text style={{ ...textRoles.button, color: text.primary }}>
                  Continue with Google
                </Text>
              </View>
            </Button>

            <Button
              label="Cancel"
              variant="ghost"
              size="md"
              onPress={() => setShowOAuthModal(false)}
            />
          </View>
        </View>
      </Modal>
    </AuthShell>
  );
}
