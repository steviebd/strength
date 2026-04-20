import { Pressable, Text, View } from 'react-native';
import { authClient } from '@/lib/auth-client';
import { useUserPreferences } from '@/context/UserPreferencesContext';

export default function Profile() {
  const { data: session, isPending } = authClient.useSession();
  const { weightUnit, setWeightUnit, isLoading } = useUserPreferences();

  const handleSignOut = () => {
    authClient.signOut();
  };

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-darkBg">
        <Text className="text-darkMuted">Loading...</Text>
      </View>
    );
  }

  if (!session?.user) {
    return (
      <View className="flex-1 items-center justify-center bg-darkBg">
        <Text className="text-darkMuted">Not signed in</Text>
      </View>
    );
  }

  const { user } = session;
  const initial = user.name?.[0]?.toUpperCase() ?? '?';

  return (
    <View className="flex-1 bg-darkBg">
      <View className="px-6 pt-16">
        <Text className="text-darkMuted text-sm font-medium uppercase tracking-wider">Profile</Text>

        <View className="mt-6 items-center">
          <View className="mb-4 h-24 w-24 items-center justify-center rounded-full bg-pine">
            <Text className="text-3xl font-semibold text-white">{initial}</Text>
          </View>
          <Text className="text-darkText text-2xl font-semibold">{user.name}</Text>
          <Text className="text-darkMuted mt-1 text-sm">{user.email}</Text>
        </View>

        <View className="mt-8 rounded-3xl border border-darkBorder bg-darkCard p-6">
          <Text className="text-darkText mb-4 text-sm font-semibold">Account</Text>

          <View className="mb-4 flex-row items-center justify-between py-3 border-b border-darkBorder">
            <Text className="text-darkMuted text-sm">Name</Text>
            <Text className="text-darkText text-sm">{user.name}</Text>
          </View>

          <View className="flex-row items-center justify-between py-3">
            <Text className="text-darkMuted text-sm">Email</Text>
            <Text className="text-darkText text-sm">{user.email}</Text>
          </View>
        </View>

        <View className="mt-6 rounded-3xl border border-darkBorder bg-darkCard p-6">
          <Text className="text-darkText mb-4 text-sm font-semibold">Settings</Text>

          <View className="flex-row items-center justify-between py-3 border-b border-darkBorder">
            <Text className="text-darkMuted text-sm">Weight Unit</Text>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => setWeightUnit('kg')}
                disabled={isLoading}
                className={`rounded-lg px-3 py-1.5 ${
                  weightUnit === 'kg' ? 'bg-coral text-white' : 'bg-darkBorder text-darkMuted'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${weightUnit === 'kg' ? 'text-white' : 'text-darkMuted'}`}
                >
                  kg
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setWeightUnit('lbs')}
                disabled={isLoading}
                className={`rounded-lg px-3 py-1.5 ${
                  weightUnit === 'lbs' ? 'bg-coral text-white' : 'bg-darkBorder text-darkMuted'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${weightUnit === 'lbs' ? 'text-white' : 'text-darkMuted'}`}
                >
                  lbs
                </Text>
              </Pressable>
            </View>
          </View>

          <Pressable className="flex-row items-center justify-between py-3 border-b border-darkBorder">
            <Text className="text-darkMuted text-sm">Notifications</Text>
            <Text className="text-darkMuted text-sm">›</Text>
          </Pressable>

          <Pressable className="flex-row items-center justify-between py-3 border-b border-darkBorder">
            <Text className="text-darkMuted text-sm">Privacy</Text>
            <Text className="text-darkMuted text-sm">›</Text>
          </Pressable>

          <Pressable className="flex-row items-center justify-between py-3">
            <Text className="text-darkMuted text-sm">Help & Support</Text>
            <Text className="text-darkMuted text-sm">›</Text>
          </Pressable>
        </View>

        <Pressable onPress={handleSignOut} className="mt-8 rounded-2xl bg-coral py-4">
          <Text className="text-center text-base font-semibold text-white">Sign Out</Text>
        </Pressable>

        <View className="mt-8 items-center">
          <Text className="text-darkMuted text-xs">Strength v1.0.0</Text>
        </View>
      </View>
    </View>
  );
}
