import { Pressable, Text, View } from 'react-native';

interface TemplateCardProps {
  id: string;
  name: string;
  exerciseCount: number;
  onStart: (templateId: string) => void;
  onEdit: (templateId: string) => void;
}

export function TemplateCard({ id, name, exerciseCount, onStart, onEdit }: TemplateCardProps) {
  return (
    <View className="rounded-xl border border-darkBorder bg-darkCard p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-darkText text-lg font-semibold flex-1" numberOfLines={1}>
          {name}
        </Text>
        <Pressable className="ml-2 rounded-md bg-darkBorder px-2 py-1" onPress={() => onEdit(id)}>
          <Text className="text-darkMuted text-xs">Edit</Text>
        </Pressable>
      </View>
      <Text className="text-darkMuted text-sm mb-4">{exerciseCount} exercises</Text>
      <Pressable className="rounded-lg bg-coral py-3" onPress={() => onStart(id)}>
        <Text className="text-center text-sm font-semibold text-white">Start Workout</Text>
      </Pressable>
    </View>
  );
}
