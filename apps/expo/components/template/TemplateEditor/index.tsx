import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, Modal, StyleSheet } from 'react-native';
import { colors, typography } from '@/theme';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Collapsible } from '@/components/ui/Collapsible';
import { ScreenScrollView } from '@/components/ui/Screen';
import { ExerciseSearch } from '@/components/workout/ExerciseSearch';
import { useUndo } from '@/hooks/useUndo';
import { apiFetch } from '@/lib/api';
import type { SelectedExercise, Template, TemplateEditorProps } from './types';

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

interface FormData {
  name: string;
  description: string;
  notes: string;
}

interface UseTemplateEditorStateReturn {
  formData: FormData;
  selectedExercises: SelectedExercise[];
  accessoryAddedWeights: Record<string, number>;
  errors: { name?: string };
  validateForm: () => boolean;
  setFormData: (data: Partial<FormData>) => void;
  addExercise: (exercise: SelectedExercise) => void;
  removeExercise: (id: string) => void;
  updateExercise: (id: string, updates: Partial<SelectedExercise>) => void;
  reorderExercises: (fromIndex: number, toIndex: number) => void;
  pushUndo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  handleUndo: () => void;
  handleRedo: () => void;
}

function useTemplateEditorState(
  initialFormData?: FormData,
  initialExercises?: SelectedExercise[],
): UseTemplateEditorStateReturn {
  const [formData, setFormDataState] = useState<FormData>({
    name: initialFormData?.name ?? '',
    description: initialFormData?.description ?? '',
    notes: initialFormData?.notes ?? '',
  });
  const [selectedExercises, setSelectedExercises] = useState<SelectedExercise[]>(
    initialExercises ?? [],
  );
  const [accessoryAddedWeights, setAccessoryAddedWeights] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<{ name?: string }>({});

  const undoState = useUndo<{
    exercises: SelectedExercise[];
    formData: FormData;
    accessoryWeights: Record<string, number>;
  }>({
    exercises: selectedExercises,
    formData,
    accessoryWeights: accessoryAddedWeights,
  });

  const setFormData = useCallback((data: Partial<FormData>) => {
    setFormDataState((prev) => ({ ...prev, ...data }));
  }, []);

  const validateForm = useCallback((): boolean => {
    const newErrors: { name?: string } = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Template name is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData.name]);

  const addExercise = useCallback((exercise: SelectedExercise) => {
    setSelectedExercises((prev) => [...prev, exercise]);
  }, []);

  const removeExercise = useCallback((id: string) => {
    setSelectedExercises((prev) => prev.filter((e) => e.id !== id));
    setAccessoryAddedWeights((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const updateExercise = useCallback((id: string, updates: Partial<SelectedExercise>) => {
    setSelectedExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  }, []);

  const reorderExercises = useCallback((fromIndex: number, toIndex: number) => {
    setSelectedExercises((prev) => {
      const next = [...prev];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
      return next;
    });
  }, []);

  const pushUndo = useCallback(() => {
    undoState.push({
      exercises: selectedExercises,
      formData,
      accessoryWeights: accessoryAddedWeights,
    });
  }, [undoState.push, selectedExercises, formData, accessoryAddedWeights]);

  const handleUndo = useCallback(() => {
    undoState.undo();
    const past = undoState.past;
    if (past.length > 0) {
      const lastState = past[past.length - 1];
      setSelectedExercises(lastState.exercises);
      setFormDataState(lastState.formData);
      setAccessoryAddedWeights(lastState.accessoryWeights);
    }
  }, [undoState]);

  const handleRedo = useCallback(() => {
    undoState.redo();
    const future = undoState.future;
    if (future.length > 0) {
      const nextState = future[0];
      setSelectedExercises(nextState.exercises);
      setFormDataState(nextState.formData);
      setAccessoryAddedWeights(nextState.accessoryWeights);
    }
  }, [undoState]);

  return {
    formData,
    selectedExercises,
    accessoryAddedWeights,
    errors,
    validateForm,
    setFormData,
    addExercise,
    removeExercise,
    updateExercise,
    reorderExercises,
    pushUndo,
    canUndo: undoState.canUndo,
    canRedo: undoState.canRedo,
    handleUndo,
    handleRedo,
  };
}

function useTemplateEditorApi({
  mode,
  templateId,
  formData,
  selectedExercises,
  onSaved,
}: {
  mode: 'create' | 'edit';
  templateId?: string;
  formData: FormData;
  selectedExercises: SelectedExercise[];
  onSaved?: (template: Template) => void;
}) {
  const [isLoading, _setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const saveTemplate = useCallback(async (): Promise<Template | null> => {
    setIsSaving(true);
    setAutoSaveStatus('saving');
    console.log('Saving template:', { mode, templateId, formData });
    try {
      const isNew = mode === 'create';
      const url = isNew ? '/api/templates' : `/api/templates/${templateId}`;
      const method = isNew ? 'POST' : 'PUT';
      console.log('Fetch config:', { url, method });

      const savedTemplate = await apiFetch<Template>(url, {
        method,
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || undefined,
          notes: formData.notes || undefined,
        }),
      });

      if (!isNew && templateId && savedTemplate.id) {
        await syncExercises(templateId, savedTemplate.id);
      } else if (isNew) {
        for (let i = 0; i < selectedExercises.length; i++) {
          const ex = selectedExercises[i];
          await apiFetch(`/api/templates/${savedTemplate.id}/exercises`, {
            method: 'POST',
            body: JSON.stringify({
              exerciseId: ex.exerciseId,
              orderIndex: i,
              isAccessory: ex.isAccessory ?? false,
              isRequired: ex.isRequired ?? true,
              sets: ex.sets ?? 3,
              reps: ex.reps ?? 10,
              targetWeight: ex.targetWeight ?? 0,
              isAmrap: ex.isAmrap ?? false,
            }),
          });
        }
      }

      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
      onSaved?.(savedTemplate);
      return savedTemplate;
    } catch (err) {
      console.error('Failed to save template:', err);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save template');
      setAutoSaveStatus('idle');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [mode, templateId, formData, selectedExercises, onSaved]);

  const syncExercises = async (currentTemplateId: string, newTemplateId: string) => {
    const newExerciseIds = new Set(selectedExercises.map((e) => e.exerciseId));

    const existingExercises = await apiFetch<Array<{ exerciseId: string; orderIndex: number }>>(
      `/api/templates/${currentTemplateId}/exercises`,
    );

    const deletePromises = existingExercises
      .filter((existing) => !newExerciseIds.has(existing.exerciseId))
      .map((existing) =>
        apiFetch(`/api/templates/${currentTemplateId}/exercises/${existing.exerciseId}`, {
          method: 'DELETE',
        }),
      );

    await Promise.all(deletePromises);

    const addPromises: Array<Promise<unknown>> = [];
    for (let i = 0; i < selectedExercises.length; i++) {
      const ex = selectedExercises[i];
      const existing = existingExercises.find((ee) => ee.exerciseId === ex.exerciseId);
      if (!existing) {
        addPromises.push(
          apiFetch(`/api/templates/${newTemplateId}/exercises`, {
            method: 'POST',
            body: JSON.stringify({
              exerciseId: ex.exerciseId,
              orderIndex: i,
              isAccessory: ex.isAccessory ?? false,
              isRequired: ex.isRequired ?? true,
              sets: ex.sets ?? 3,
              reps: ex.reps ?? 10,
              targetWeight: ex.targetWeight ?? 0,
              isAmrap: ex.isAmrap ?? false,
            }),
          }),
        );
      }
    }

    await Promise.all(addPromises);
  };

  return {
    isLoading,
    isSaving,
    autoSaveStatus,
    saveTemplate,
  };
}

export function TemplateEditor({
  mode,
  templateId,
  initialData,
  onSaved,
  onClose,
}: TemplateEditorProps) {
  const [showExerciseSearch, setShowExerciseSearch] = useState(false);

  const initialFormData = {
    name: initialData?.name ?? '',
    description: initialData?.description ?? '',
    notes: initialData?.notes ?? '',
  };

  const initialExercises =
    initialData?.exercises?.map((ex) => ({
      ...ex,
      id: ex.id || generateId(),
    })) ?? [];

  const {
    formData,
    selectedExercises,
    errors,
    validateForm,
    setFormData,
    addExercise,
    removeExercise,
    updateExercise,
    reorderExercises,
    pushUndo,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
  } = useTemplateEditorState(initialFormData, initialExercises);

  const { saveTemplate, isSaving, autoSaveStatus } = useTemplateEditorApi({
    mode,
    templateId,
    formData,
    selectedExercises,
    onSaved,
  });

  const handleAddExercise = useCallback(
    (exercises: Array<{ id: string; name: string; muscleGroup: string | null }>) => {
      pushUndo();
      for (const exercise of exercises) {
        const newExercise: SelectedExercise = {
          id: generateId(),
          exerciseId: exercise.id,
          name: exercise.name,
          muscleGroup: exercise.muscleGroup,
          isAmrap: false,
          isAccessory: false,
          isRequired: true,
          sets: 3,
          reps: 10,
          repsRaw: '10',
          targetWeight: 0,
        };
        addExercise(newExercise);
      }
    },
    [pushUndo, addExercise],
  );

  const handleRemoveExercise = useCallback(
    (id: string) => {
      pushUndo();
      removeExercise(id);
    },
    [pushUndo, removeExercise],
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index > 0) {
        pushUndo();
        reorderExercises(index, index - 1);
      }
    },
    [pushUndo, reorderExercises],
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index < selectedExercises.length - 1) {
        pushUndo();
        reorderExercises(index, index + 1);
      }
    },
    [pushUndo, reorderExercises, selectedExercises.length],
  );

  const handleUpdateExercise = useCallback(
    (id: string, updates: Partial<SelectedExercise>) => {
      pushUndo();
      updateExercise(id, updates);
    },
    [pushUndo, updateExercise],
  );

  const handleSave = useCallback(async () => {
    if (!validateForm()) return;
    const result = await saveTemplate();
    if (result && onSaved) {
      onSaved(result);
    }
  }, [validateForm, saveTemplate, onSaved]);

  const handleCancel = useCallback(() => {
    if (mode === 'create' && (formData.name || selectedExercises.length > 0)) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => onClose?.(),
          },
        ],
      );
    } else {
      onClose?.();
    }
  }, [mode, formData.name, selectedExercises.length, onClose]);

  const currentExercises = selectedExercises;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={handleCancel}
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
        >
          <Text style={styles.iconButtonText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          {mode === 'create' ? 'Create Template' : 'Edit Template'}
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleUndo}
            disabled={!canUndo}
            style={[
              styles.iconButton,
              !canUndo ? styles.iconButtonDisabled : styles.iconButtonActive,
            ]}
          >
            <Text style={styles.iconButtonText}>↩</Text>
          </Pressable>
          <Pressable
            onPress={handleRedo}
            disabled={!canRedo}
            style={[
              styles.iconButton,
              !canRedo ? styles.iconButtonDisabled : styles.iconButtonActive,
            ]}
          >
            <Text style={styles.iconButtonText}>↪</Text>
          </Pressable>
        </View>
      </View>

      {mode === 'edit' && (
        <View style={styles.statusBar}>
          <View style={styles.statusBarContent}>
            {autoSaveStatus === 'saving' && (
              <>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.statusBarText}>Saving...</Text>
              </>
            )}
            {autoSaveStatus === 'saved' && <Text style={styles.statusBarSaved}>Saved</Text>}
          </View>
        </View>
      )}

      <ScreenScrollView bottomInset={48} horizontalPadding={16}>
        <View style={styles.section}>
          <Text style={styles.label}>Template Name *</Text>
          <Input
            placeholder="Enter template name"
            value={formData.name}
            onChangeText={(text) => setFormData({ name: text })}
          />
          {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Description</Text>
          <Input
            placeholder="Enter description (optional)"
            value={formData.description}
            onChangeText={(text) => setFormData({ description: text })}
          />
        </View>

        <Collapsible label="Notes" style={styles.section}>
          <Input
            placeholder="Enter notes (optional)"
            value={formData.notes}
            onChangeText={(text) => setFormData({ notes: text })}
            style={styles.notesInput}
          />
        </Collapsible>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>Exercises ({currentExercises.length})</Text>
            <Pressable
              onPress={() => setShowExerciseSearch(true)}
              style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
            >
              <Text style={styles.addButtonText}>+ Add Exercise</Text>
            </Pressable>
          </View>

          {currentExercises.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>No exercises added yet</Text>
              <Text style={styles.emptySubtext}>Tap "+ Add Exercise" to get started</Text>
            </Card>
          ) : (
            <View style={styles.exerciseList}>
              {currentExercises.map((exercise, index) => (
                <Card key={exercise.id} style={styles.exerciseCard}>
                  <View style={styles.exerciseHeader}>
                    <View style={styles.exerciseInfo}>
                      <Text style={styles.exerciseName}>{exercise.name}</Text>
                      {exercise.muscleGroup && (
                        <Text style={styles.exerciseMuscle}>{exercise.muscleGroup}</Text>
                      )}
                    </View>
                    <View style={styles.exerciseActions}>
                      <Pressable
                        onPress={() => handleMoveUp(index)}
                        disabled={index === 0}
                        style={[
                          styles.smallIconButton,
                          index === 0
                            ? styles.smallIconButtonDisabled
                            : styles.smallIconButtonActive,
                        ]}
                      >
                        <Text style={styles.smallIconButtonText}>↑</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleMoveDown(index)}
                        disabled={index === currentExercises.length - 1}
                        style={[
                          styles.smallIconButton,
                          index === currentExercises.length - 1
                            ? styles.smallIconButtonDisabled
                            : styles.smallIconButtonActive,
                        ]}
                      >
                        <Text style={styles.smallIconButtonText}>↓</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleRemoveExercise(exercise.id)}
                        style={styles.deleteButton}
                      >
                        <Text style={styles.deleteButtonText}>×</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.exerciseRow}>
                    <View style={styles.exerciseField}>
                      <Text style={styles.fieldLabel}>Sets</Text>
                      <View style={styles.counterContainer}>
                        <Pressable
                          onPress={() => {
                            const currentSets = exercise.sets ?? 3;
                            const newSets = currentSets > 1 ? currentSets - 1 : 1;
                            handleUpdateExercise(exercise.id, { sets: newSets });
                          }}
                          style={styles.counterButton}
                        >
                          <Text style={styles.counterButtonText}>-</Text>
                        </Pressable>
                        <Text style={styles.counterValue}>{exercise.sets ?? 3}</Text>
                        <Pressable
                          onPress={() => {
                            const currentSets = exercise.sets ?? 3;
                            const newSets = currentSets + 1;
                            handleUpdateExercise(exercise.id, { sets: newSets });
                          }}
                          style={styles.counterButton}
                        >
                          <Text style={styles.counterButtonText}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.exerciseField}>
                      <Text style={styles.fieldLabel}>Reps</Text>
                      <View style={styles.counterContainer}>
                        <Pressable
                          onPress={() => {
                            const currentReps = exercise.reps ?? 10;
                            const newReps = currentReps > 1 ? currentReps - 1 : 1;
                            handleUpdateExercise(exercise.id, {
                              reps: newReps,
                              repsRaw: newReps.toString(),
                            });
                          }}
                          style={styles.counterButton}
                        >
                          <Text style={styles.counterButtonText}>-</Text>
                        </Pressable>
                        <Text style={styles.counterValue}>
                          {exercise.repsRaw || (exercise.reps ?? 10).toString()}
                        </Text>
                        <Pressable
                          onPress={() => {
                            const currentReps = exercise.reps ?? 10;
                            const newReps = currentReps + 1;
                            handleUpdateExercise(exercise.id, {
                              reps: newReps,
                              repsRaw: newReps.toString(),
                            });
                          }}
                          style={styles.counterButton}
                        >
                          <Text style={styles.counterButtonText}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.exerciseField}>
                      <Text style={styles.fieldLabel}>Weight</Text>
                      <View style={styles.counterContainer}>
                        <Pressable
                          onPress={() => {
                            const currentWeight = exercise.targetWeight ?? 0;
                            const newWeight = Math.max(0, currentWeight - 5);
                            handleUpdateExercise(exercise.id, { targetWeight: newWeight });
                          }}
                          style={styles.counterButton}
                        >
                          <Text style={styles.counterButtonText}>-</Text>
                        </Pressable>
                        <Text style={styles.counterValue}>
                          {exercise.targetWeight && exercise.targetWeight > 0
                            ? exercise.targetWeight
                            : '0'}
                        </Text>
                        <Pressable
                          onPress={() => {
                            const currentWeight = exercise.targetWeight ?? 0;
                            const newWeight = currentWeight + 5;
                            handleUpdateExercise(exercise.id, { targetWeight: newWeight });
                          }}
                          style={styles.counterButton}
                        >
                          <Text style={styles.counterButtonText}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>

                  <View style={styles.toggleRow}>
                    <Pressable
                      onPress={() =>
                        handleUpdateExercise(exercise.id, { isAmrap: !exercise.isAmrap })
                      }
                      style={[
                        styles.toggleButton,
                        exercise.isAmrap ? styles.toggleButtonActive : styles.toggleButtonDefault,
                      ]}
                    >
                      <View
                        style={[
                          styles.toggleCheckbox,
                          exercise.isAmrap
                            ? styles.toggleCheckboxActive
                            : styles.toggleCheckboxDefault,
                        ]}
                      />
                      <Text
                        style={[
                          styles.toggleText,
                          exercise.isAmrap ? styles.toggleTextActive : styles.toggleTextDefault,
                        ]}
                      >
                        AMRAP
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        handleUpdateExercise(exercise.id, { isAccessory: !exercise.isAccessory })
                      }
                      style={[
                        styles.toggleButton,
                        exercise.isAccessory
                          ? styles.toggleButtonActive
                          : styles.toggleButtonDefault,
                      ]}
                    >
                      <View
                        style={[
                          styles.toggleCheckbox,
                          exercise.isAccessory
                            ? styles.toggleCheckboxActive
                            : styles.toggleCheckboxDefault,
                        ]}
                      />
                      <Text
                        style={[
                          styles.toggleText,
                          exercise.isAccessory ? styles.toggleTextActive : styles.toggleTextDefault,
                        ]}
                      >
                        Accessory
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        handleUpdateExercise(exercise.id, { isRequired: !exercise.isRequired })
                      }
                      style={[
                        styles.toggleButton,
                        !exercise.isRequired
                          ? styles.toggleButtonActive
                          : styles.toggleButtonDefault,
                      ]}
                    >
                      <View
                        style={[
                          styles.toggleCheckbox,
                          !exercise.isRequired
                            ? styles.toggleCheckboxActive
                            : styles.toggleCheckboxDefault,
                        ]}
                      />
                      <Text
                        style={[
                          styles.toggleText,
                          !exercise.isRequired ? styles.toggleTextActive : styles.toggleTextDefault,
                        ]}
                      >
                        Optional
                      </Text>
                    </Pressable>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </View>
      </ScreenScrollView>

      <View style={styles.footer}>
        <Button variant="outline" onPress={handleCancel} style={styles.footerButton}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Button>
        <Button onPress={handleSave} disabled={isSaving} style={styles.footerButton}>
          {isSaving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Template</Text>
          )}
        </Button>
      </View>

      <Modal
        visible={showExerciseSearch}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowExerciseSearch(false)}
      >
        <ExerciseSearch
          visible={showExerciseSearch}
          onSelect={handleAddExercise}
          onClose={() => setShowExerciseSearch(false)}
          excludeIds={currentExercises.map((e) => e.exerciseId)}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  iconButtonActive: {
    backgroundColor: colors.border,
  },
  iconButtonPressed: {
    opacity: 0.7,
  },
  iconButtonDisabled: {
    opacity: 0.3,
  },
  iconButtonText: {
    fontSize: 20,
    color: colors.text,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  statusBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBarText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
  },
  statusBarSaved: {
    fontSize: typography.fontSizes.xs,
    color: colors.success,
  },
  section: {
    marginBottom: 16,
  },
  label: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    marginBottom: 8,
  },
  errorText: {
    fontSize: typography.fontSizes.xs,
    color: colors.error,
    marginTop: 4,
  },
  notesInput: {
    height: 96,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 9999,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.95 }],
  },
  addButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
  },
  emptySubtext: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
    marginTop: 4,
  },
  exerciseList: {
    gap: 12,
  },
  exerciseCard: {
    padding: 16,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  exerciseMuscle: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
  },
  exerciseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  smallIconButton: {
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  smallIconButtonActive: {
    backgroundColor: colors.border,
  },
  smallIconButtonDisabled: {
    opacity: 0.3,
  },
  smallIconButtonText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
  },
  deleteButton: {
    marginLeft: 8,
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  deleteButtonText: {
    fontSize: typography.fontSizes.sm,
    color: colors.error,
  },
  exerciseRow: {
    flexDirection: 'row',
    gap: 12,
  },
  exerciseField: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
    marginBottom: 4,
  },
  counterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  counterButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterButtonText: {
    fontSize: typography.fontSizes.lg,
    color: colors.textMuted,
  },
  counterValue: {
    fontSize: typography.fontSizes.base,
    color: colors.text,
    textAlign: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toggleButtonActive: {
    backgroundColor: colors.border,
  },
  toggleButtonDefault: {
    backgroundColor: 'transparent',
  },
  toggleCheckbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  toggleCheckboxActive: {
    backgroundColor: colors.textMuted,
    borderWidth: 1,
    borderColor: colors.textMuted,
  },
  toggleCheckboxDefault: {
    borderWidth: 1,
    borderColor: colors.textMuted,
    backgroundColor: 'transparent',
  },
  toggleText: {
    fontSize: typography.fontSizes.xs,
  },
  toggleTextActive: {
    color: colors.text,
  },
  toggleTextDefault: {
    color: colors.textMuted,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
  },
  footerButton: {
    flex: 1,
  },
  cancelButtonText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  saveButtonText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    textAlign: 'center',
  },
});
