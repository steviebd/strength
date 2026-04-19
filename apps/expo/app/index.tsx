import { router } from 'expo-router';
import { Text, View, TouchableOpacity } from 'react-native';
import { useAuth } from '@/lib/auth-context';

export default function Index() {
  const { user, isLoading, signOut } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-black">
        <Text className="text-gray-600 dark:text-gray-400">Loading...</Text>
      </View>
    );
  }

  if (!user) {
    router.replace('/auth/sign-in');
    return null;
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/auth/sign-in');
  }

  return (
    <View className="flex-1 bg-white dark:bg-black px-6 py-12">
      <View className="mb-8">
        <Text className="text-3xl font-bold text-gray-900 dark:text-white">Home</Text>
        <Text className="mt-2 text-gray-600 dark:text-gray-400">Welcome back!</Text>
      </View>

      <View className="rounded-lg bg-gray-100 p-6 dark:bg-gray-800">
        <Text className="text-sm text-gray-600 dark:text-gray-400">Signed in as</Text>
        <Text className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{user.email}</Text>
        {user.name && (
          <Text className="mt-1 text-gray-600 dark:text-gray-400">{user.name}</Text>
        )}
      </View>

      <View className="mt-8">
        <TouchableOpacity
          className="w-full rounded-lg bg-red-600 px-4 py-3"
          onPress={handleSignOut}
        >
          <Text className="text-center font-semibold text-white">Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
