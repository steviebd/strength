import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

type WeightUnit = 'kg' | 'lbs';

const KG_TO_LBS = 2.20462;

interface WorkoutCardProps {
  id: string;
  name: string;
  date: string;
  durationMinutes: number | null;
  totalVolume: number | null;
  exerciseCount: number;
  weightUnit?: WeightUnit;
}

export function WorkoutCard({
  id,
  name,
  date,
  durationMinutes,
  totalVolume,
  exerciseCount,
  weightUnit = 'kg',
}: WorkoutCardProps) {
  const router = useRouter();

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return '--';
    if (minutes < 60) return `${minutes}m`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}h ${mins}m`;
  };

  const formatVolume = (volume: number | null) => {
    if (!volume) return '--';
    const displayVolume = weightUnit === 'lbs' ? volume * KG_TO_LBS : volume;
    if (displayVolume >= 1000) return `${(displayVolume / 1000).toFixed(1)}k`;
    return displayVolume.toString();
  };

  return (
    <Pressable
      className="rounded-xl border border-darkBorder bg-darkCard p-4"
      onPress={() => router.push({ pathname: '/workout-session', params: { workoutId: id } })}
    >
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-darkText text-lg font-semibold" numberOfLines={1}>
          {name}
        </Text>
        <Text className="text-darkMuted text-xs">{formatDate(date)}</Text>
      </View>
      <View className="flex-row gap-4">
        <View className="flex-1">
          <Text className="text-darkMuted text-xs">Duration</Text>
          <Text className="text-darkText text-sm font-medium">
            {formatDuration(durationMinutes)}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-darkMuted text-xs">Volume</Text>
          <Text className="text-darkText text-sm font-medium">
            {formatVolume(totalVolume)} {weightUnit}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-darkMuted text-xs">Exercises</Text>
          <Text className="text-darkText text-sm font-medium">{exerciseCount}</Text>
        </View>
      </View>
    </Pressable>
  );
}
