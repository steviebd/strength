import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTemplateEditor, type Template } from '@/hooks/useTemplateEditor';
import { TemplateExerciseRow } from './TemplateExerciseRow';
import { ExercisePicker } from './ExercisePicker';
import { ScreenScrollView } from '@/components/ui/Screen';
import { colors, spacing, radius } from '@/theme';

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

  const handleAddExercise = async (
    exercises: Array<{
      id: string;
      name: string;
      muscleGroup: string | null;
    }>,
  ) => {
    for (const exercise of exercises) {
      await addExercise(exercise);
    }
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={onClose} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.headerRight}>
            {autoSaveStatus === 'saving' && (
              <ActivityIndicator size="small" color={colors.accent} />
            )}
            {autoSaveStatus === 'saved' && <Text style={styles.savedText}>Saved</Text>}
            <Pressable
              onPress={handleSave}
              disabled={isSaving || !localName.trim()}
              style={[
                styles.saveButton,
                (isSaving || !localName.trim()) && styles.saveButtonDisabled,
              ]}
            >
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save'}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <ScreenScrollView bottomInset={48} horizontalPadding={16}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Template Name</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g., Push Day"
            placeholderTextColor={colors.placeholderText}
            value={localName}
            onChangeText={setLocalName}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Description (optional)</Text>
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            placeholder="Brief description of this workout"
            placeholderTextColor={colors.placeholderText}
            value={localDescription}
            onChangeText={setLocalDescription}
            multiline
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Notes (optional)</Text>
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            placeholder="Any additional notes"
            placeholderTextColor={colors.placeholderText}
            value={localNotes}
            onChangeText={setLocalNotes}
            multiline
          />
        </View>

        <View style={styles.exerciseHeader}>
          <Text style={styles.exerciseHeaderTitle}>Exercises</Text>
          <Pressable onPress={() => setShowExercisePicker(true)} style={styles.addButton}>
            <Text style={styles.addButtonText}>+ Add</Text>
          </Pressable>
        </View>

        {exercises.length === 0 ? (
          <View style={styles.emptyExercises}>
            <Text style={styles.emptyExercisesText}>
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
      </ScreenScrollView>

      <ExercisePicker
        visible={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onSelect={handleAddExercise}
        selectedIds={exercises.map((e) => e.exerciseId)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: colors.surfaceAlt,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  savedText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  saveButton: {
    borderRadius: 9999,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.accent,
  },
  saveButtonDisabled: {
    backgroundColor: colors.surfaceAlt,
  },
  saveButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 17,
    color: colors.text,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  exerciseHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  addButton: {
    borderRadius: 9999,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.accent,
  },
  addButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyExercises: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(24,24,27,0.5)',
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyExercisesText: {
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
