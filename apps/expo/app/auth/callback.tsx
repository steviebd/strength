import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, ActivityIndicator } from 'react-native';

export default function CallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const error = params.get('error');

    if (error) {
      router.replace('/auth/sign-in?error=' + encodeURIComponent(error));
      return;
    }

    if (token) {
      localStorage.setItem('auth_token', token);
      router.replace('/');
    } else {
      router.replace('/auth/sign-in');
    }
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-black">
      <ActivityIndicator size="large" className="text-blue-600" />
      <Text className="mt-4 text-gray-600 dark:text-gray-400">Completing sign in...</Text>
    </View>
  );
}
