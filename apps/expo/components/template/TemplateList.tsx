import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useTemplates, type Template } from '@/hooks/useTemplates';

interface TemplateListProps {
  onEditTemplate?: (template: Template) => void;
  onStartWorkout?: (template: Template) => void;
}

export function TemplateList({ onEditTemplate, onStartWorkout }: TemplateListProps) {
  const { templates, isLoading, isError: _isError, deleteTemplate } = useTemplates();

  const handleDelete = (template: Template) => {
    Alert.alert('Delete Template', `Are you sure you want to delete "${template.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (!template.id) {
            return;
          }
          deleteTemplate.mutate(template.id);
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-darkBg">
        <ActivityIndicator size="large" color="#ef6f4f" />
      </View>
    );
  }

  if (templates.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-darkBg px-6">
        <Text className="text-darkText text-xl font-bold mb-2">No Templates Yet</Text>
        <Text className="text-darkMuted text-center">
          Tap "+ New" to create your first workout template.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-darkBg p-4" contentContainerStyle={{ paddingBottom: 100 }}>
      {templates.map((template) => (
        <View
          key={template.id}
          className="mb-4 rounded-2xl border border-darkBorder bg-darkCard p-5"
        >
          <Pressable
            onPress={() => {
              if (onEditTemplate) {
                onEditTemplate(template);
              }
            }}
            className="mb-3"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-darkText text-lg font-semibold">{template.name}</Text>
              <View className="rounded-full bg-coral/20 px-3 py-1">
                <Text className="text-coral text-xs font-medium">
                  {template.exercises?.length || 0} exercises
                </Text>
              </View>
            </View>
            {template.description && (
              <Text className="text-darkMuted mt-2 text-sm">{template.description}</Text>
            )}
          </Pressable>

          {template.exercises && template.exercises.length > 0 && (
            <View className="mb-3 border-t border-darkBorder pt-3">
              <Text className="text-darkMuted mb-2 text-xs font-medium uppercase">Exercises</Text>
              <View className="gap-1">
                {template.exercises.slice(0, 3).map((ex) => (
                  <View key={ex.id} className="flex-row items-center justify-between">
                    <Text className="text-darkText text-sm">{ex.name}</Text>
                    <Text className="text-darkMuted text-xs">
                      {ex.sets} × {ex.reps}
                      {ex.isAmrap ? '+' : ''}
                    </Text>
                  </View>
                ))}
                {template.exercises.length > 3 && (
                  <Text className="text-darkMuted text-xs mt-1">
                    +{template.exercises.length - 3} more
                  </Text>
                )}
              </View>
            </View>
          )}

          <View className="flex-row gap-3">
            <Pressable
              onPress={() => {
                if (onStartWorkout) {
                  onStartWorkout(template);
                }
              }}
              className="flex-1 items-center justify-center rounded-xl bg-coral py-3"
            >
              <Text className="text-white text-sm font-semibold">Start Workout</Text>
            </Pressable>
            <Pressable
              onPress={() => handleDelete(template)}
              className="h-10 w-10 items-center justify-center rounded-xl bg-red-500/20"
            >
              <Text className="text-red-400">🗑</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
