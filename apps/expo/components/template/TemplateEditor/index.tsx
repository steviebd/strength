import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography } from '@/theme';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Collapsible } from '@/components/ui/Collapsible';
import { ScreenScrollView } from '@/components/ui/Screen';
import { ExerciseSearch } from '@/components/workout/ExerciseSearch';
import { useUndo } from '@/hooks/useUndo';
import { apiFetch } from '@/lib/api';
import { getDefaultExerciseTargets } from '@/lib/exerciseProgression';
import type { SelectedExercise, Template, TemplateEditorProps } from './types';

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

const DEFAULT_TEMPLATE_SETS = 1;
const DEFAULT_TEMPLATE_REPS = 5;
const DEFAULT_TEMPLATE_WEIGHT = 0;

function parseIntegerField(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseDecimalField(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function templateExercisePayload(ex: SelectedExercise, orderIndex: number) {
  return {
    exerciseId: ex.exerciseId,
    orderIndex,
    exerciseType: ex.exerciseType ?? 'weighted',
    isAccessory: ex.isAccessory ?? false,
    isRequired: ex.isRequired ?? true,
    sets: ex.sets ?? DEFAULT_TEMPLATE_SETS,
    reps: ex.reps ?? DEFAULT_TEMPLATE_REPS,
    repsRaw: ex.repsRaw ?? (ex.reps ?? DEFAULT_TEMPLATE_REPS).toString(),
    targetWeight: ex.targetWeight ?? DEFAULT_TEMPLATE_WEIGHT,
    addedWeight: ex.addedWeight ?? 0,
    targetDuration: ex.targetDuration ?? null,
    targetDistance: ex.targetDistance ?? null,
    targetHeight: ex.targetHeight ?? null,
    isAmrap: ex.isAmrap ?? false,
  };
}

function isAmrapExercise(exercise: { isAmrap?: boolean | null; name: string }) {
  return (
    exercise.isAmrap ??
    (exercise.name.endsWith('3+') || exercise.name.toLowerCase().includes('amrap'))
  );
}

async function chooseAmrapMode() {
  return new Promise<'only' | 'with-working' | 'skip'>((resolve) => {
    Alert.alert('AMRAP sets', 'How should this exercise be added?', [
      { text: 'AMRAP only', onPress: () => resolve('only') },
      { text: 'Working sets + AMRAP', onPress: () => resolve('with-working') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve('skip') },
    ]);
  });
}

function buildSelectedExercise(
  exercise: {
    id: string;
    libraryId?: string | null;
    name: string;
    muscleGroup: string | null;
    exerciseType?: string | null;
  },
  amrapOnly = false,
): SelectedExercise {
  const targets = getDefaultExerciseTargets(exercise.exerciseType);
  return {
    id: generateId(),
    exerciseId: exercise.id,
    libraryId: exercise.libraryId ?? undefined,
    name: amrapOnly ? `${exercise.name} (AMRAP)` : exercise.name,
    muscleGroup: exercise.muscleGroup,
    isAmrap: amrapOnly,
    isAccessory: false,
    isRequired: true,
    exerciseType: exercise.exerciseType ?? 'weighted',
    sets: amrapOnly ? 1 : Number.parseInt(targets.sets, 10),
    reps: targets.reps ? Number.parseInt(targets.reps, 10) : DEFAULT_TEMPLATE_REPS,
    repsRaw: amrapOnly ? 'AMRAP' : targets.reps || DEFAULT_TEMPLATE_REPS.toString(),
    targetWeight: targets.weight ? Number.parseFloat(targets.weight) : DEFAULT_TEMPLATE_WEIGHT,
    targetDuration: targets.duration ? Number.parseInt(targets.duration, 10) : null,
    targetDistance: targets.distance ? Number.parseInt(targets.distance, 10) : null,
    targetHeight: targets.height ? Number.parseInt(targets.height, 10) : null,
  };
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
  const isSavingRef = useRef(false);

  const saveTemplate = useCallback(async (): Promise<Template | null> => {
    if (isSavingRef.current) return null;
    isSavingRef.current = true;
    setIsSaving(true);
    setAutoSaveStatus('saving');
    try {
      const isNew = mode === 'create';
      const url = isNew ? '/api/templates' : `/api/templates/${templateId}`;
      const method = isNew ? 'POST' : 'PUT';

      const savedTemplate = await apiFetch<Template>(url, {
        method,
        body: {
          name: formData.name,
          description: formData.description || undefined,
          notes: formData.notes || undefined,
        },
      });

      if (!isNew && templateId && savedTemplate.id) {
        await syncExercises(templateId, savedTemplate.id);
      } else if (isNew) {
        await Promise.all(
          selectedExercises.map((ex, i) =>
            apiFetch(`/api/templates/${savedTemplate.id}/exercises`, {
              method: 'POST',
              body: templateExercisePayload(ex, i),
            }),
          ),
        );
      }

      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
      onSaved?.(savedTemplate);
      return savedTemplate;
    } catch (error) {
      Alert.alert(
        'Unable to save template',
        error instanceof Error ? error.message : 'Please try again.',
      );
      setAutoSaveStatus('idle');
      return null;
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [mode, templateId, formData, selectedExercises, onSaved]);

  const syncExercises = async (currentTemplateId: string, newTemplateId: string) => {
    const existingExercises = await apiFetch<Array<{ id: string; exerciseId: string }>>(
      `/api/templates/${currentTemplateId}/exercises`,
    );

    await Promise.all(
      existingExercises.map((existing) =>
        apiFetch(`/api/templates/${currentTemplateId}/exercises/${existing.id}`, {
          method: 'DELETE',
        }),
      ),
    );

    await Promise.all(
      selectedExercises.map((ex, i) =>
        apiFetch(`/api/templates/${newTemplateId}/exercises`, {
          method: 'POST',
          body: templateExercisePayload(ex, i),
        }),
      ),
    );
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
  const insets = useSafeAreaInsets();
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
  } = useTemplateEditorState(initialFormData, initialExercises);

  const { saveTemplate, isSaving } = useTemplateEditorApi({
    mode,
    templateId,
    formData,
    selectedExercises,
    onSaved,
  });

  const handleAddExercise = useCallback(
    async (
      exercises: Array<{
        id: string;
        libraryId?: string | null;
        name: string;
        muscleGroup: string | null;
        exerciseType?: string | null;
        isAmrap?: boolean | null;
      }>,
    ) => {
      pushUndo();
      for (const exercise of exercises) {
        const amrapMode = isAmrapExercise(exercise) ? await chooseAmrapMode() : null;
        if (amrapMode === 'skip') continue;
        if (amrapMode === 'with-working') {
          addExercise(buildSelectedExercise(exercise));
          addExercise(buildSelectedExercise(exercise, true));
          continue;
        }
        addExercise(buildSelectedExercise(exercise, amrapMode === 'only'));
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
    await saveTemplate();
  }, [validateForm, saveTemplate]);

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
      <ScreenScrollView bottomInset={160} horizontalPadding={16} topPadding={insets.top + 16}>
        <View style={styles.section}>
          <Text style={styles.label}>Template Name *</Text>
          <Input
            testID="template-name"
            placeholder="Enter template name"
            value={formData.name}
            onChangeText={(text) => setFormData({ name: text })}
          />
          {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Description</Text>
          <Input
            testID="template-description"
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
              testID="template-add-exercise"
              accessibilityLabel="template-add-exercise"
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
                <Card key={`template-editor-card:${exercise.id}`} style={styles.exerciseCard}>
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
                            const currentSets = exercise.sets ?? DEFAULT_TEMPLATE_SETS;
                            handleUpdateExercise(exercise.id, {
                              sets: Math.max(1, currentSets - 1),
                            });
                          }}
                          style={({ pressed }) => [
                            styles.counterButton,
                            styles.counterButtonLeft,
                            pressed && styles.counterButtonPressed,
                          ]}
                        >
                          <Text style={styles.counterButtonText}>-</Text>
                        </Pressable>
                        <TextInput
                          style={styles.exerciseInput}
                          value={(exercise.sets ?? DEFAULT_TEMPLATE_SETS).toString()}
                          onChangeText={(text) => {
                            const sets = parseIntegerField(text);
                            handleUpdateExercise(exercise.id, {
                              sets: sets ?? DEFAULT_TEMPLATE_SETS,
                            });
                          }}
                          keyboardType="number-pad"
                          selectTextOnFocus
                          placeholderTextColor={colors.placeholderText}
                        />
                        <Pressable
                          onPress={() => {
                            const currentSets = exercise.sets ?? DEFAULT_TEMPLATE_SETS;
                            handleUpdateExercise(exercise.id, { sets: currentSets + 1 });
                          }}
                          style={({ pressed }) => [
                            styles.counterButton,
                            styles.counterButtonRight,
                            pressed && styles.counterButtonPressed,
                          ]}
                        >
                          <Text style={styles.counterButtonText}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                    {exercise.exerciseType !== 'timed' && exercise.exerciseType !== 'cardio' && (
                      <View style={styles.exerciseField}>
                        <Text style={styles.fieldLabel}>Reps</Text>
                        <View style={styles.counterContainer}>
                          <Pressable
                            onPress={() => {
                              const currentReps = exercise.reps ?? DEFAULT_TEMPLATE_REPS;
                              const reps = Math.max(1, currentReps - 1);
                              handleUpdateExercise(exercise.id, {
                                reps,
                                repsRaw: reps.toString(),
                              });
                            }}
                            style={({ pressed }) => [
                              styles.counterButton,
                              styles.counterButtonLeft,
                              pressed && styles.counterButtonPressed,
                            ]}
                          >
                            <Text style={styles.counterButtonText}>-</Text>
                          </Pressable>
                          <TextInput
                            style={styles.exerciseInput}
                            value={
                              exercise.repsRaw ||
                              (exercise.reps ?? DEFAULT_TEMPLATE_REPS).toString()
                            }
                            onChangeText={(text) => {
                              const reps = parseIntegerField(text);
                              handleUpdateExercise(exercise.id, {
                                reps: reps ?? DEFAULT_TEMPLATE_REPS,
                                repsRaw: text,
                              });
                            }}
                            keyboardType="number-pad"
                            selectTextOnFocus
                            placeholderTextColor={colors.placeholderText}
                          />
                          <Pressable
                            onPress={() => {
                              const currentReps = exercise.reps ?? DEFAULT_TEMPLATE_REPS;
                              const reps = currentReps + 1;
                              handleUpdateExercise(exercise.id, {
                                reps,
                                repsRaw: reps.toString(),
                              });
                            }}
                            style={({ pressed }) => [
                              styles.counterButton,
                              styles.counterButtonRight,
                              pressed && styles.counterButtonPressed,
                            ]}
                          >
                            <Text style={styles.counterButtonText}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                    {(!exercise.exerciseType || exercise.exerciseType === 'weighted') && (
                      <View style={styles.exerciseField}>
                        <Text style={styles.fieldLabel}>Weight</Text>
                        <View style={styles.counterContainer}>
                          <Pressable
                            onPress={() => {
                              const currentWeight =
                                exercise.targetWeight ?? DEFAULT_TEMPLATE_WEIGHT;
                              handleUpdateExercise(exercise.id, {
                                targetWeight: Math.max(0, currentWeight - 5),
                              });
                            }}
                            style={({ pressed }) => [
                              styles.counterButton,
                              styles.counterButtonLeft,
                              pressed && styles.counterButtonPressed,
                            ]}
                          >
                            <Text style={styles.counterButtonText}>-</Text>
                          </Pressable>
                          <TextInput
                            style={styles.exerciseInput}
                            value={(exercise.targetWeight ?? DEFAULT_TEMPLATE_WEIGHT).toString()}
                            onChangeText={(text) => {
                              const targetWeight = parseDecimalField(text);
                              handleUpdateExercise(exercise.id, {
                                targetWeight: targetWeight ?? DEFAULT_TEMPLATE_WEIGHT,
                              });
                            }}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                            placeholderTextColor={colors.placeholderText}
                          />
                          <Pressable
                            onPress={() => {
                              const currentWeight =
                                exercise.targetWeight ?? DEFAULT_TEMPLATE_WEIGHT;
                              handleUpdateExercise(exercise.id, {
                                targetWeight: currentWeight + 5,
                              });
                            }}
                            style={({ pressed }) => [
                              styles.counterButton,
                              styles.counterButtonRight,
                              pressed && styles.counterButtonPressed,
                            ]}
                          >
                            <Text style={styles.counterButtonText}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                    {(exercise.exerciseType === 'timed' || exercise.exerciseType === 'cardio') && (
                      <TargetNumberField
                        label="Duration (sec)"
                        value={exercise.targetDuration}
                        onChange={(targetDuration) =>
                          handleUpdateExercise(exercise.id, { targetDuration })
                        }
                      />
                    )}
                    {exercise.exerciseType === 'cardio' && (
                      <TargetNumberField
                        label="Distance (m)"
                        value={exercise.targetDistance}
                        onChange={(targetDistance) =>
                          handleUpdateExercise(exercise.id, { targetDistance })
                        }
                      />
                    )}
                    {exercise.exerciseType === 'plyo' && (
                      <TargetNumberField
                        label="Height (cm)"
                        value={exercise.targetHeight}
                        onChange={(targetHeight) =>
                          handleUpdateExercise(exercise.id, { targetHeight })
                        }
                      />
                    )}
                  </View>

                  <View style={styles.toggleRow}>
                    <Pressable
                      onPress={() => {
                        if (exercise.isAmrap) {
                          handleUpdateExercise(exercise.id, {
                            isAmrap: false,
                            name: exercise.name.replace(/\s+\(AMRAP\)$/i, ''),
                          });
                          return;
                        }
                        Alert.alert('AMRAP sets', 'How should this exercise be added?', [
                          {
                            text: 'AMRAP only',
                            onPress: () =>
                              handleUpdateExercise(exercise.id, {
                                isAmrap: true,
                                name: `${exercise.name.replace(/\s+\(AMRAP\)$/i, '')} (AMRAP)`,
                                sets: 1,
                              }),
                          },
                          {
                            text: 'Working sets + AMRAP',
                            onPress: () =>
                              addExercise(
                                buildSelectedExercise(
                                  {
                                    id: exercise.exerciseId,
                                    libraryId: exercise.libraryId,
                                    name: exercise.name.replace(/\s+\(AMRAP\)$/i, ''),
                                    muscleGroup: exercise.muscleGroup,
                                    exerciseType: exercise.exerciseType,
                                  },
                                  true,
                                ),
                              ),
                          },
                          { text: 'Cancel', style: 'cancel' },
                        ]);
                      }}
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

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.footerButton}>
          <Button variant="outline" size="lg" onPress={handleCancel} fullWidth>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Button>
        </View>
        <View style={styles.footerButton}>
          <Button
            testID="template-save"
            size="lg"
            onPress={handleSave}
            disabled={isSaving}
            fullWidth
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Template</Text>
            )}
          </Button>
        </View>
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

function TargetNumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <View style={styles.exerciseField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.exerciseInput}
        value={value == null ? '' : value.toString()}
        onChangeText={(text) => onChange(parseIntegerField(text))}
        keyboardType="number-pad"
        selectTextOnFocus
        placeholder="0"
        placeholderTextColor={colors.placeholderText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  counterButton: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  counterButtonLeft: {
    left: 0,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  counterButtonRight: {
    right: 0,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  counterButtonPressed: {
    backgroundColor: colors.border,
  },
  counterButtonText: {
    fontSize: typography.fontSizes.lg,
    color: colors.text,
  },
  exerciseInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 36,
    paddingVertical: 8,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.medium,
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: 20,
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
