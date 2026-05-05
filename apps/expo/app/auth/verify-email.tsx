import { useEffect, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { AuthShell } from '@/components/auth-shell';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/Button';
import { colors, spacing, textRoles, surface, border, text } from '@/theme';

export default function VerifyEmailScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      if (!token) {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage('Invalid or missing verification token.');
        }
        return;
      }

      try {
        const result = await authClient.verifyEmail({ token } as any);

        if (cancelled) return;

        if (result.error) {
          setStatus('error');
          setErrorMessage(
            result.error.message ?? 'This verification link is invalid or has expired.',
          );
        } else {
          setStatus('success');
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'This verification link is invalid or has expired.',
          );
        }
      }
    }

    verify();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === 'loading') {
    return (
      <AuthShell
        eyebrow="Strength"
        title="Verifying email"
        subtitle="Please wait while we verify your email address."
      >
        <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
          <ActivityIndicator size="large" color={colors.accentSecondary} />
          <Text style={{ ...textRoles.bodySmall, color: colors.textMuted }}>Verifying...</Text>
        </View>
      </AuthShell>
    );
  }

  if (status === 'success') {
    return (
      <AuthShell
        eyebrow="Strength"
        title="Email verified"
        subtitle="Your email has been verified successfully."
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
              Your email has been verified.
            </Text>
          </View>

          <Button
            label="Go to Sign In"
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
      eyebrow="Strength"
      title="Verification failed"
      subtitle="We couldn't verify your email address."
    >
      <View style={{ gap: spacing.lg }}>
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
          <Text style={{ ...textRoles.bodySmall, color: text.danger }}>
            {errorMessage ?? 'This verification link is invalid or has expired.'}
          </Text>
        </View>

        <Button
          label="Go to Sign In"
          variant="primary"
          size="md"
          fullWidth
          onPress={() => router.replace('/auth/sign-in')}
        />
      </View>
    </AuthShell>
  );
}
