import { useEffect, useState, useRef } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { Platform, Text, View } from 'react-native';
import { AuthShell, AuthShellHandle } from '@/components/auth-shell';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';
import { spacing, textRoles, surface, border, text } from '@/theme';
import * as Linking from 'expo-linking';

export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const authShellRef = useRef<AuthShellHandle>(null);
  const newPasswordInputRef = useRef<any>(null);
  const confirmPasswordInputRef = useRef<any>(null);

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing reset token.');
    }
  }, [token]);

  async function handleSubmit() {
    if (!token) {
      setError('Invalid or missing reset token.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const result = await authClient.resetPassword({
        newPassword,
        token,
      });

      if (result.error) {
        setError(result.error.message ?? 'Unable to reset password.');
        return;
      }

      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    return (
      <AuthShell
        ref={authShellRef}
        eyebrow="Strength"
        title="Password updated"
        subtitle="Your password has been reset successfully."
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
              Your password has been updated. Please sign in with your new password.
            </Text>
          </View>

          <Button
            label="Go to Sign In"
            variant="primary"
            size="md"
            fullWidth
            onPress={() => router.replace('/auth/sign-in')}
          />

          {Platform.OS === 'web' ? (
            <Button
              label="Open in App"
              variant="outline"
              size="md"
              fullWidth
              onPress={() => Linking.openURL(`${env.appScheme}://auth/sign-in`)}
            />
          ) : null}
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      ref={authShellRef}
      eyebrow="Strength"
      title="Set new password"
      subtitle="Enter a new password for your account."
    >
      <View style={{ gap: spacing.lg }}>
        <TextField
          testID="auth-reset-password-new"
          ref={newPasswordInputRef}
          label="New Password"
          leftIcon="lock-closed-outline"
          secureTextEntry
          placeholder="At least 8 characters"
          value={newPassword}
          onChangeText={setNewPassword}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
        />

        <TextField
          testID="auth-reset-password-confirm"
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
          testID="auth-reset-password-submit"
          label={isSubmitting ? 'Updating...' : 'Update password'}
          variant="primary"
          size="md"
          fullWidth
          loading={isSubmitting}
          disabled={isSubmitting}
          onPress={handleSubmit}
        />
      </View>
    </AuthShell>
  );
}
