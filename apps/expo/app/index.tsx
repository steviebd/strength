import { Link, Redirect } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { authClient } from "@/lib/auth-client";

export default function HomeScreen() {
  const session = authClient.useSession();

  if (session.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-sand">
        <ActivityIndicator size="large" color="#1f4d3c" />
      </View>
    );
  }

  if (!session.data) {
    return <Redirect href="/auth/sign-in" />;
  }

  return (
    <View className="flex-1 bg-sand px-6 py-12">
      <View className="flex-1 justify-between rounded-[32px] bg-pine px-6 py-8">
        <View className="gap-4">
          <Text className="text-xs font-semibold uppercase tracking-[2px] text-white/70">
            Development Auth
          </Text>
          <Text className="text-4xl font-semibold leading-tight text-white">
            Signed in and ready to build the real app shell.
          </Text>
          <Text className="text-base leading-6 text-white/75">
            This starter only enables email and password auth in development so you can sign up,
            sign in, and verify the Worker plus D1 flow end to end.
          </Text>
        </View>

        <View className="gap-4">
          <View className="rounded-3xl bg-white/10 p-5">
            <Text className="text-sm text-white/70">Current user</Text>
            <Text className="mt-2 text-2xl font-semibold text-white">
              {session.data.user.name || session.data.user.email}
            </Text>
            <Text className="mt-1 text-sm text-white/70">{session.data.user.email}</Text>
          </View>

          <Pressable
            className="rounded-full bg-coral px-5 py-4"
            onPress={async () => {
              await authClient.signOut();
            }}
          >
            <Text className="text-center text-base font-semibold text-white">Sign out</Text>
          </Pressable>

          <Link href="/auth/sign-in" asChild>
            <Pressable className="rounded-full border border-white/25 px-5 py-4">
              <Text className="text-center text-base font-semibold text-white">
                Back to auth screens
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </View>
  );
}
