import { Pressable, Text, View } from 'react-native';

interface ActiveWorkoutBannerProps {
  workoutId: string;
  workoutName: string;
  startedAt: string;
  onContinue: () => void;
  onDiscard: () => void;
}

export function ActiveWorkoutBanner({
  workoutId: _workoutId,
  workoutName,
  startedAt,
  onContinue,
  onDiscard,
}: ActiveWorkoutBannerProps) {
  const formatStartedAt = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <View className="mx-6 rounded-2xl border border-coral/50 bg-coral/10 p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-coral text-xs font-semibold uppercase tracking-wider">
            Active Workout
          </Text>
          <Text className="text-darkText text-lg font-semibold mt-1" numberOfLines={1}>
            {workoutName}
          </Text>
          <Text className="text-darkMuted text-xs mt-1">
            Started at {formatStartedAt(startedAt)}
          </Text>
        </View>
      </View>
      <View className="flex-row gap-3">
        <Pressable className="flex-1 rounded-lg bg-coral py-3" onPress={onContinue}>
          <Text className="text-center text-sm font-semibold text-white">Continue</Text>
        </Pressable>
        <Pressable className="flex-1 rounded-lg border border-darkBorder py-3" onPress={onDiscard}>
          <Text className="text-center text-sm font-semibold text-darkMuted">Discard</Text>
        </Pressable>
      </View>
    </View>
  );
}
