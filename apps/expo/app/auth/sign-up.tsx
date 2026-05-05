import { useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Link, router } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AuthShell, AuthShellHandle } from '@/components/auth-shell';
import { buildAuthCallbackURL, nativeGoogleAuthReturnToKey } from '@/lib/auth-callback-url';
import { authClient } from '@/lib/auth-client';
import { waitForSessionReady } from '@/lib/auth-session';
import { platformStorage } from '@/lib/platform-storage';
import { sendVerificationEmailRequest } from '@/lib/verification-email';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';
import { colors, spacing, textRoles, surface, border, text } from '@/theme';
import Svg, { Path } from 'react-native-svg';

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isEmailSubmitting, setIsEmailSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [showVerificationPending, setShowVerificationPending] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const searchParams = useLocalSearchParams();
  const authShellRef = useRef<AuthShellHandle>(null);
  const emailRef = useRef<any>(null);
  const passwordRef = useRef<any>(null);
  const confirmPasswordRef = useRef<any>(null);
  const nameInputRef = useRef<any>(null);
  const emailInputRef = useRef<any>(null);
  const passwordInputRef = useRef<any>(null);
  const confirmPasswordInputRef = useRef<any>(null);
  const redirectUrl = (searchParams.returnTo as string) || '/';

  useFocusEffect(
    useCallback(() => {
      setIsGoogleSubmitting(false);
    }, []),
  );

  async function handleSubmit() {
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setError(null);
    setIsEmailSubmitting(true);

    try {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message ?? 'Unable to create account.');
        return;
      }

      const ready = await waitForSessionReady();
      if (!ready) {
        setShowVerificationPending(true);
        return;
      }
      router.replace(redirectUrl as any);
    } catch (error) {
      const isNetworkError = error instanceof Error && error.message === 'Network request failed';
      if (isNetworkError) {
        platformStorage.setItem(
          'auth_pending_signup',
          JSON.stringify({ name, email, password, timestamp: Date.now() }),
        );
        setError("You're offline. We'll sign you in automatically when you're back online.");
        return;
      }
      setError(error instanceof Error ? error.message : 'Unable to create account.');
    } finally {
      setIsEmailSubmitting(false);
    }
  }

  async function handleGoogleSignUp() {
    setError(null);
    setIsGoogleSubmitting(true);

    try {
      const callbackURL = buildAuthCallbackURL(redirectUrl);
      platformStorage.setItem(nativeGoogleAuthReturnToKey, redirectUrl);
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL,
        errorCallbackURL: callbackURL,
        requestSignUp: true,
      });

      if (result.error) {
        setError(result.error.message ?? 'Unable to sign up with Google.');
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
      setError(error instanceof Error ? error.message : 'Unable to sign up.');
    } finally {
      setIsGoogleSubmitting(false);
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

  function scrollToInput(ref: React.RefObject<any>) {
    ref.current?.measure((_x: any, _y: any, _width: any, _height: any, _pageX: any, pageY: any) => {
      authShellRef.current?.scrollToInput(pageY);
    });
  }

  if (showVerificationPending) {
    return (
      <AuthShell
        ref={authShellRef}
        eyebrow="Strength"
        title="Verify your email"
        subtitle="You're almost there."
      >
        <View style={{ gap: spacing.lg }}>
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: border.success,
              backgroundColor: surface.success,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <Text style={{ ...textRoles.bodySmall, color: text.success }}>
              Check your email to verify your account before signing in.
            </Text>
          </View>

          <Button
            label="Go to Sign In"
            variant="primary"
            size="md"
            fullWidth
            onPress={() => router.replace('/auth/sign-in')}
          />

          <Button
            label={isResendingVerification ? 'Sending...' : 'Resend verification email'}
            variant="outline"
            size="md"
            fullWidth
            loading={isResendingVerification}
            disabled={isResendingVerification}
            onPress={handleResendVerification}
          />
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      ref={authShellRef}
      eyebrow="Strength"
      title="Create account"
      subtitle="Start your journey with us today."
    >
      <View style={{ gap: spacing.lg }}>
        <TextField
          testID="auth-sign-up-name"
          ref={nameInputRef}
          label="Name"
          leftIcon="person-outline"
          placeholder="Your name"
          value={name}
          onChangeText={setName}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => emailRef.current?.focus()}
          onFocus={() => scrollToInput(nameInputRef)}
        />

        <TextField
          testID="auth-sign-up-email"
          ref={emailInputRef}
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
          onFocus={() => scrollToInput(emailInputRef)}
        />

        <TextField
          testID="auth-sign-up-password"
          ref={passwordInputRef}
          label="Password"
          leftIcon="lock-closed-outline"
          secureTextEntry
          placeholder="At least 8 characters"
          value={password}
          onChangeText={setPassword}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => confirmPasswordRef.current?.focus()}
          onFocus={() => scrollToInput(passwordInputRef)}
        />

        <TextField
          testID="auth-sign-up-confirm-password"
          ref={confirmPasswordInputRef}
          label="Confirm Password"
          leftIcon="lock-closed-outline"
          secureTextEntry
          placeholder="Confirm your password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          returnKeyType="done"
          blurOnSubmit={false}
          onSubmitEditing={handleSubmit}
          onFocus={() => scrollToInput(confirmPasswordInputRef)}
        />

        {error ? (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: border.danger,
              backgroundColor: surface.danger,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <Text style={{ ...textRoles.bodySmall, color: text.danger }}>{error}</Text>
          </View>
        ) : null}

        <Button
          testID="auth-sign-up-submit"
          label={isEmailSubmitting ? 'Creating account...' : 'Create account'}
          variant="primary"
          size="md"
          fullWidth
          loading={isEmailSubmitting}
          disabled={isEmailSubmitting}
          onPress={handleSubmit}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text style={{ ...textRoles.caption, color: colors.textMuted }}>or</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        <Button
          testID="auth-sign-up-google"
          variant="outline"
          size="md"
          fullWidth
          disabled={isGoogleSubmitting}
          onPress={handleGoogleSignUp}
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
              {isGoogleSubmitting ? 'Signing up...' : 'Continue with Google'}
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
            By creating an account, you agree to our{' '}
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
            Already have an account?{' '}
          </Text>
          <Link href="/auth/sign-in">
            <Text style={{ ...textRoles.body, color: colors.accent, fontWeight: '600' }}>
              Sign in
            </Text>
          </Link>
        </View>
      </View>
    </AuthShell>
  );
}
