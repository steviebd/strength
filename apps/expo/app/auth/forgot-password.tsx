import { useState, useRef } from 'react';
import { Link, router } from 'expo-router';
import { Text, View } from 'react-native';
import { AuthShell, AuthShellHandle } from '@/components/auth-shell';
import { requestPasswordResetEmail } from '@/lib/password-reset';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';
import { colors, spacing, textRoles, surface, border, text } from '@/theme';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const authShellRef = useRef<AuthShellHandle>(null);
  const emailInputRef = useRef<any>(null);

  async function handleSubmit() {
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await requestPasswordResetEmail(email.trim());
      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reset email.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    return (
      <AuthShell
        ref={authShellRef}
        eyebrow="Strength"
        title="Check your inbox"
        subtitle="If this email exists in our system, you will receive a reset link."
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
              If this email exists in our system, check your inbox for a reset link.
            </Text>
          </View>

          <Button
            label="Back to Sign In"
            variant="primary"
            size="md"
            fullWidth
            onPress={() => router.replace('/auth/sign-in')}
          />
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      ref={authShellRef}
      eyebrow="Strength"
      title="Reset password"
      subtitle="Enter your email and we'll send you a link to reset your password."
    >
      <View style={{ gap: spacing.lg }}>
        <TextField
          testID="auth-forgot-password-email"
          ref={emailInputRef}
          label="Email"
          leftIcon="mail-outline"
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          returnKeyType="done"
          blurOnSubmit={false}
          onSubmitEditing={handleSubmit}
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
          testID="auth-forgot-password-submit"
          label={isSubmitting ? 'Sending...' : 'Send reset link'}
          variant="primary"
          size="md"
          fullWidth
          loading={isSubmitting}
          disabled={isSubmitting}
          onPress={handleSubmit}
        />

        <View style={{ flexDirection: 'row', justifyContent: 'center', paddingTop: spacing.sm }}>
          <Text style={{ ...textRoles.body, color: colors.textMuted }}>
            Remember your password?{' '}
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
