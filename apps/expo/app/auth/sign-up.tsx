import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Link, router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { AuthShell, AuthShellHandle } from '@/components/auth-shell';
import { authClient } from '@/lib/auth-client';
import { colors } from '@/theme';

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    setIsSubmitting(true);

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

      router.replace(redirectUrl as any);
    } catch (error) {
      setError(
        error instanceof Error && error.message === 'Network request failed'
          ? 'Unable to reach the auth server. Confirm the Worker is running and EXPO_PUBLIC_API_URL points at a reachable host.'
          : error instanceof Error
            ? error.message
            : 'Unable to create account.',
      );
    } finally {
      setIsSubmitting(false);
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
      title="Create account"
      subtitle="Start your journey with us today."
    >
      <View style={{ gap: 20 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '500', color: colors.textMuted }}>Name</Text>
          <View ref={nameInputRef} style={{ position: 'relative' }}>
            <Text
              style={{
                position: 'absolute',
                left: 16,
                top: 16,
                fontSize: 16,
                color: colors.textMuted,
              }}
            >
              👤
            </Text>
            <TextInput
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
              placeholder="Your name"
              placeholderTextColor="#6b7280"
              value={name}
              onChangeText={setName}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => emailRef.current?.focus()}
              onFocus={() => scrollToInput(nameInputRef)}
            />
          </View>
        </View>

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
              ✉️
            </Text>
            <TextInput
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
              placeholderTextColor="#6b7280"
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
              placeholder="At least 8 characters"
              placeholderTextColor="#6b7280"
              value={password}
              onChangeText={setPassword}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => confirmPasswordRef.current?.focus()}
              onFocus={() => scrollToInput(passwordInputRef)}
            />
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '500', color: colors.textMuted }}>
            Confirm Password
          </Text>
          <View ref={confirmPasswordInputRef} style={{ position: 'relative' }}>
            <Text
              style={{
                position: 'absolute',
                left: 16,
                top: 16,
                fontSize: 16,
                color: colors.textMuted,
              }}
            >
              🔐
            </Text>
            <TextInput
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
              placeholder="Confirm your password"
              placeholderTextColor="#6b7280"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              returnKeyType="done"
              blurOnSubmit={false}
              onSubmitEditing={handleSubmit}
              onFocus={() => scrollToInput(confirmPasswordInputRef)}
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
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: colors.accent,
            borderRadius: 12,
            paddingVertical: 16,
            marginTop: 8,
            opacity: isSubmitting ? 0.6 : 1,
          }}
          disabled={isSubmitting}
          onPress={handleSubmit}
        >
          {isSubmitting && <ActivityIndicator size="small" color="#ffffff" />}
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </Text>
        </Pressable>

        <View style={{ flexDirection: 'row', justifyContent: 'center', paddingTop: 8 }}>
          <Text style={{ fontSize: 14, color: colors.textMuted }}>Already have an account? </Text>
          <Link href="/auth/sign-in">
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>Sign in</Text>
          </Link>
        </View>
      </View>
    </AuthShell>
  );
}
