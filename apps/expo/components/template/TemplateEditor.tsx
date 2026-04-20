import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTemplateEditor, type Template } from '@/hooks/useTemplateEditor';
import { TemplateExerciseRow } from './TemplateExerciseRow';
import { ExercisePicker } from './ExercisePicker';

interface TemplateEditorProps {
  templateId?: string | null;
  mode: 'create' | 'edit';
  onClose: () => void;
  onSaved?: (template: Template) => void;
}

export function TemplateEditor({ templateId, mode, onClose, onSaved }: TemplateEditorProps) {
  const insets = useSafeAreaInsets();
  const {
    template,
    exercises,
    isLoading,
    isSaving,
    autoSaveStatus,
    weightUnit,
    loadTemplate,
    saveTemplate,
    addExercise,
    removeExercise,
    updateExercise,
    reorderExercises,
    setTemplateName,
    setTemplateDescription,
    setTemplateNotes,
    createEmptyTemplate,
  } = useTemplateEditor();

  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [localName, setLocalName] = useState('');
  const [localDescription, setLocalDescription] = useState('');
  const [localNotes, setLocalNotes] = useState('');

  useEffect(() => {
    if (mode === 'create') {
      createEmptyTemplate();
    } else if (mode === 'edit' && templateId) {
      loadTemplate(templateId);
    }
  }, [mode, templateId]);

  useEffect(() => {
    if (template) {
      setLocalName(template.name || '');
      setLocalDescription(template.description || '');
      setLocalNotes(template.notes || '');
    }
  }, [template]);

  const handleSave = async () => {
    setTemplateName(localName);
    setTemplateDescription(localDescription);
    setTemplateNotes(localNotes);
    const saved = await saveTemplate();
    if (saved && onSaved) {
      onSaved(saved);
      onClose();
    }
  };

  const handleAddExercise = async (exercise: {
    id: string;
    name: string;
    muscleGroup: string | null;
  }) => {
    await addExercise(exercise);
    setShowExercisePicker(false);
  };

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      reorderExercises(index, index - 1);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < exercises.length - 1) {
      reorderExercises(index, index + 1);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-darkBg items-center justify-center">
        <ActivityIndicator size="large" color="#ef6f4f" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-darkBg">
      <View className="border-b border-darkBorder p-4" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={onClose}
            className="h-10 w-10 items-center justify-center rounded-full bg-darkBorder"
          >
            <Text className="text-darkText text-xl">←</Text>
          </Pressable>
          <View className="flex-row items-center gap-2">
            {autoSaveStatus === 'saving' && <ActivityIndicator size="small" color="#ef6f4f" />}
            {autoSaveStatus === 'saved' && <Text className="text-darkMuted text-xs">Saved</Text>}
            <Pressable
              onPress={handleSave}
              disabled={isSaving || !localName.trim()}
              className={`rounded-full px-4 py-2 ${isSaving || !localName.trim() ? 'bg-darkBorder' : 'bg-coral'}`}
            >
              <Text className="text-white text-sm font-semibold">
                {isSaving ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 100 }}>
        <View className="mb-6">
          <Text className="text-darkMuted mb-2 text-sm">Template Name</Text>
          <TextInput
            className="rounded-xl border border-darkBorder bg-darkCard px-4 py-3 text-darkText text-lg"
            placeholder="e.g., Push Day"
            placeholderTextColor="#71717a"
            value={localName}
            onChangeText={setLocalName}
          />
        </View>

        <View className="mb-6">
          <Text className="text-darkMuted mb-2 text-sm">Description (optional)</Text>
          <TextInput
            className="rounded-xl border border-darkBorder bg-darkCard px-4 py-3 text-darkText"
            placeholder="Brief description of this workout"
            placeholderTextColor="#71717a"
            value={localDescription}
            onChangeText={setLocalDescription}
            multiline
          />
        </View>

        <View className="mb-6">
          <Text className="text-darkMuted mb-2 text-sm">Notes (optional)</Text>
          <TextInput
            className="rounded-xl border border-darkBorder bg-darkCard px-4 py-3 text-darkText"
            placeholder="Any additional notes"
            placeholderTextColor="#71717a"
            value={localNotes}
            onChangeText={setLocalNotes}
            multiline
          />
        </View>

        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-darkText text-lg font-semibold">Exercises</Text>
          <Pressable
            onPress={() => setShowExercisePicker(true)}
            className="rounded-full bg-coral px-4 py-2"
          >
            <Text className="text-white text-sm font-semibold">+ Add</Text>
          </Pressable>
        </View>

        {exercises.length === 0 ? (
          <View className="rounded-xl border border-darkBorder border-dashed bg-darkCard/50 p-8 items-center">
            <Text className="text-darkMuted text-center">
              No exercises added yet. Tap "+ Add" to add exercises to this template.
            </Text>
          </View>
        ) : (
          exercises.map((exercise, index) => (
            <TemplateExerciseRow
              key={exercise.id}
              exercise={exercise}
              onUpdate={(updates) => updateExercise(exercise.id, updates)}
              onRemove={() => removeExercise(exercise.id)}
              onMoveUp={() => handleMoveUp(index)}
              onMoveDown={() => handleMoveDown(index)}
              isFirst={index === 0}
              isLast={index === exercises.length - 1}
              weightUnit={weightUnit}
            />
          ))
        )}
      </ScrollView>

      <ExercisePicker
        visible={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onSelect={handleAddExercise}
        selectedIds={exercises.map((e) => e.exerciseId)}
      />
    </View>
  );
}
