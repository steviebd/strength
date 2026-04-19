import { useState } from 'react';
import { Link, router } from 'expo-router';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '@/lib/auth-context';

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signUp, signInWithGoogle } = useAuth();

  async function handleSubmit() {
    if (!email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    try {
      await signUp(email, password, name || undefined);
      router.replace('/');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Sign up failed');
    } finally {
      setIsLoading(false);
    }
  }

  function handleGoogleSignIn() {
    signInWithGoogle();
  }

  return (
    <View className="flex-1 justify-center px-6 bg-white dark:bg-black">
      <View className="mb-8">
        <Text className="text-3xl font-bold text-gray-900 dark:text-white">Create account</Text>
        <Text className="mt-2 text-gray-600 dark:text-gray-400">Start your journey with us</Text>
      </View>

      <View className="space-y-4">
        <View>
          <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Name</Text>
          <TextInput
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            placeholder="Your name"
            value={name}
            onChangeText={setName}
          />
        </View>

        <View>
          <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Email</Text>
          <TextInput
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View>
          <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Password</Text>
          <TextInput
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <View>
          <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Confirm Password</Text>
          <TextInput
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            placeholder="••••••••"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          className="w-full rounded-lg bg-blue-600 px-4 py-3 disabled:opacity-50"
          onPress={handleSubmit}
          disabled={isLoading}
        >
          <Text className="text-center font-semibold text-white">
            {isLoading ? 'Creating account...' : 'Create account'}
          </Text>
        </TouchableOpacity>

        <View className="flex flex-row items-center justify-center py-4">
          <View className="h-px flex-1 bg-gray-300 dark:bg-gray-700" />
          <Text className="px-4 text-gray-500">or</Text>
          <View className="h-px flex-1 bg-gray-300 dark:bg-gray-700" />
        </View>

        <TouchableOpacity
          className="flex flex-row items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800"
          onPress={handleGoogleSignIn}
        >
          <Text className="font-semibold text-gray-900 dark:text-white">Continue with Google</Text>
        </TouchableOpacity>
      </View>

      <View className="mt-6 flex flex-row justify-center">
        <Text className="text-gray-600 dark:text-gray-400">Already have an account? </Text>
        <Link href="/auth/sign-in">
          <Text className="font-semibold text-blue-600">Sign in</Text>
        </Link>
      </View>
    </View>
  );
}
