import { useState } from 'react';
import { Link, router } from 'expo-router';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '@/lib/auth-context';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signInWithGoogle } = useAuth();

  async function handleSubmit() {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      await signIn(email, password);
      router.replace('/');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Sign in failed');
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
        <Text className="text-3xl font-bold text-gray-900 dark:text-white">Welcome back</Text>
        <Text className="mt-2 text-gray-600 dark:text-gray-400">Sign in to continue</Text>
      </View>

      <View className="space-y-4">
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

        <TouchableOpacity
          className="w-full rounded-lg bg-blue-600 px-4 py-3 disabled:opacity-50"
          onPress={handleSubmit}
          disabled={isLoading}
        >
          <Text className="text-center font-semibold text-white">
            {isLoading ? 'Signing in...' : 'Sign in'}
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
        <Text className="text-gray-600 dark:text-gray-400">Don't have an account? </Text>
        <Link href="/auth/sign-up">
          <Text className="font-semibold text-blue-600">Sign up</Text>
        </Link>
      </View>
    </View>
  );
}
