import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { authClient } from '@/lib/auth-client';
const today = new Date();
const formattedDate = today.toLocaleDateString('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export default function HomeScreen() {
  const router = useRouter();
  const session = authClient.useSession();
  const user = session.data?.user;
  const displayName = user?.name || user?.email || 'there';
  const avatarLetter = user?.name?.[0] || user?.email?.[0] || '?';

  const mockExercises = [
    { name: 'Bench Press', sets: '4 × 8-10', muscle: 'Chest' },
    { name: 'Incline Dumbbell Press', sets: '3 × 10-12', muscle: 'Upper Chest' },
    { name: 'Cable Flyes', sets: '3 × 12-15', muscle: 'Chest' },
    { name: 'Tricep Pushdowns', sets: '3 × 10-12', muscle: 'Triceps' },
    { name: 'Overhead Tricep Extension', sets: '3 × 12-15', muscle: 'Triceps' },
  ];
  const nutrition = {
    current: 1847,
    target: 2800,
    protein: 142,
    proteinTarget: 180,
    carbs: 203,
    carbsTarget: 280,
    fat: 58,
    fatTarget: 80,
  };
  const weeklyProgress = {
    workoutsCompleted: 4,
    workoutsTarget: 5,
    streakDays: 12,
    totalVolume: 42500,
  };

  return (
    <View className="flex-1 bg-darkBg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6 pt-16">
          <View className="mb-8 flex-row items-center justify-between">
            <View>
              <Text className="text-darkMuted text-sm">{formattedDate}</Text>
              <Text className="text-darkText text-3xl font-semibold">Hey, {displayName}</Text>
            </View>
            <Pressable
              className="h-12 w-12 items-center justify-center rounded-full bg-pine"
              onPress={() => router.push('/profile')}
            >
              <Text className="text-xl font-semibold text-white">{avatarLetter}</Text>
            </Pressable>
          </View>

          <View className="mb-6 rounded-3xl border border-darkBorder bg-darkCard p-6">
            <View className="mb-4 flex-row items-center justify-between">
              <View>
                <Text className="text-darkMuted text-xs font-medium uppercase tracking-wider">
                  Today&apos;s Workout
                </Text>
                <Text className="text-darkText mt-1 text-xl font-semibold">Upper Body Day</Text>
              </View>
              <View className="rounded-full bg-coral/20 px-3 py-1">
                <Text className="text-coral text-xs font-semibold">Push Focus</Text>
              </View>
            </View>
            <View className="mb-5 gap-2">
              {mockExercises.map((ex, i) => (
                <View key={i} className="flex-row items-center justify-between py-2">
                  <View className="flex-1">
                    <Text className="text-darkText text-sm font-medium">{ex.name}</Text>
                    <Text className="text-darkMuted text-xs">{ex.muscle}</Text>
                  </View>
                  <Text className="text-darkMuted text-sm">{ex.sets}</Text>
                </View>
              ))}
            </View>
            <Pressable className="rounded-2xl bg-coral py-4">
              <Text className="text-center text-base font-semibold text-white">Start Workout</Text>
            </Pressable>
          </View>

          <View className="mb-6 rounded-2xl border border-darkBorder bg-darkCard p-5">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-darkText text-sm font-semibold">Nutrition</Text>
              <Text className="text-darkMuted text-xs">
                {nutrition.current.toLocaleString()} / {nutrition.target.toLocaleString()} kcal
              </Text>
            </View>
            <View className="mb-3 h-2 flex-row gap-2 rounded-full overflow-hidden">
              <View className="h-2 flex-1 overflow-hidden rounded-full bg-darkBorder">
                <View
                  className="h-full rounded-full bg-coral"
                  style={{ width: `${(nutrition.protein / nutrition.proteinTarget) * 100}%` }}
                />
              </View>
              <View className="h-2 flex-1 overflow-hidden rounded-full bg-darkBorder">
                <View
                  className="h-full rounded-full bg-pine"
                  style={{ width: `${(nutrition.carbs / nutrition.carbsTarget) * 100}%` }}
                />
              </View>
              <View className="h-2 flex-1 overflow-hidden rounded-full bg-darkBorder">
                <View
                  className="h-full rounded-full bg-coral"
                  style={{ width: `${(nutrition.fat / nutrition.fatTarget) * 100}%` }}
                />
              </View>
            </View>
            <View className="flex-row justify-between">
              <View className="items-center">
                <Text className="text-darkText text-xs font-semibold">{nutrition.protein}g</Text>
                <Text className="text-darkMuted text-[10px]">Protein</Text>
              </View>
              <View className="items-center">
                <Text className="text-darkText text-xs font-semibold">{nutrition.carbs}g</Text>
                <Text className="text-darkMuted text-[10px]">Carbs</Text>
              </View>
              <View className="items-center">
                <Text className="text-darkText text-xs font-semibold">{nutrition.fat}g</Text>
                <Text className="text-darkMuted text-[10px]">Fat</Text>
              </View>
            </View>
          </View>

          <View className="mb-6 rounded-2xl border border-darkBorder bg-darkCard p-5">
            <Text className="text-darkText mb-4 text-sm font-semibold">This Week</Text>
            <View className="flex-row">
              <View className="flex-1 items-center">
                <Text className="text-darkText text-2xl font-bold">
                  {weeklyProgress.workoutsCompleted}/{weeklyProgress.workoutsTarget}
                </Text>
                <Text className="text-darkMuted text-xs">Workouts</Text>
              </View>
              <View className="flex-1 items-center">
                <Text className="text-darkText text-2xl font-bold">
                  {weeklyProgress.streakDays}
                </Text>
                <Text className="text-darkMuted text-xs">Day Streak</Text>
              </View>
              <View className="flex-1 items-center">
                <Text className="text-darkText text-2xl font-bold">
                  {(weeklyProgress.totalVolume / 1000).toFixed(1)}k
                </Text>
                <Text className="text-darkMuted text-xs">Volume (lbs)</Text>
              </View>
            </View>
            <View className="mt-4 h-2 overflow-hidden rounded-full bg-darkBorder">
              <View
                className="h-full rounded-full bg-pine"
                style={{
                  width: `${(weeklyProgress.workoutsCompleted / weeklyProgress.workoutsTarget) * 100}%`,
                }}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      <View className="absolute bottom-8 right-6">
        <Pressable className="h-14 w-14 items-center justify-center rounded-full bg-coral shadow-lg shadow-coral/30">
          <Text className="text-2xl font-bold text-white">+</Text>
        </Pressable>
      </View>
    </View>
  );
}
