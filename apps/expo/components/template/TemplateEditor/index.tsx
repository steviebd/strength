import React, { useState, useCallback } from 'react';
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
import { OfflineError, tryOnlineOrEnqueue } from '@/lib/offline-mutation';
import { authClient } from '@/lib/auth-client';
import { getLocalDb } from '@/db/client';
import { localTemplates } from '@/db/local-schema';
import { eq } from 'drizzle-orm';
import { exerciseLibrary } from '@strength/db/client';
import type { SelectedExercise, Template, TemplateEditorProps } from './types';

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function getLibraryExerciseType(libraryId: string | null | undefined) {
  if (!libraryId) return null;
  return exerciseLibrary.find((exercise) => exercise.id === libraryId)?.exerciseType ?? null;
}

function resolveSelectedExerciseType(exercise: {
  libraryId?: string | null;
  exerciseType?: string | null;
}) {
  return getLibraryExerciseType(exercise.libraryId) ?? exercise.exerciseType ?? 'weighted';
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
  insertExerciseAfter: (afterId: string, exercise: SelectedExercise) => void;
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

  const insertExerciseAfter = useCallback((afterId: string, exercise: SelectedExercise) => {
    setSelectedExercises((prev) => {
      const index = prev.findIndex((e) => e.id === afterId);
      if (index === -1) {
        return [...prev, exercise];
      }
      const next = [...prev];
      next.splice(index + 1, 0, exercise);
      return next;
    });
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
    insertExerciseAfter,
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
  const [offlineMessage, setOfflineMessage] = useState<string | null>(null);
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const saveTemplate = useCallback(async (): Promise<Template | null> => {
    if (!userId) {
      Alert.alert('Unable to save template', 'You must be signed in.');
      return null;
    }
    setIsSaving(true);
    setAutoSaveStatus('saving');
    try {
      const isNew = mode === 'create';
      const url = isNew ? '/api/templates' : `/api/templates/${templateId}`;
      const method = isNew ? 'POST' : 'PUT';
      const entityId = isNew ? generateId() : templateId!;

      const savedTemplate = await tryOnlineOrEnqueue({
        apiCall: () =>
          apiFetch<Template>(url, {
            method,
            body: {
              name: formData.name,
              description: formData.description || undefined,
              notes: formData.notes || undefined,
            },
          }),
        userId,
        entityType: 'template',
        operation: isNew ? 'create_template' : 'save_template',
        entityId,
        payload: {
          name: formData.name,
          description: formData.description || undefined,
          notes: formData.notes || undefined,
        },
        onEnqueue: async () => {
          const db = getLocalDb();
          if (!db) return;
          const now = new Date();
          if (isNew) {
            db.insert(localTemplates)
              .values({
                id: entityId,
                userId,
                name: formData.name,
                description: formData.description ?? null,
                notes: formData.notes ?? null,
                isDeleted: false,
                createdLocally: true,
                createdAt: now,
                updatedAt: now,
                hydratedAt: now,
              })
              .run();
          } else {
            db.update(localTemplates)
              .set({
                name: formData.name,
                description: formData.description ?? null,
                notes: formData.notes ?? null,
                updatedAt: now,
              })
              .where(eq(localTemplates.id, templateId!))
              .run();
          }
        },
      });

      if (!isNew && templateId && savedTemplate.id) {
        await syncExercises(templateId, savedTemplate.id);
      } else if (isNew) {
        for (let i = 0; i < selectedExercises.length; i++) {
          const ex = selectedExercises[i];
          await apiFetch(`/api/templates/${savedTemplate.id}/exercises`, {
            method: 'POST',
            body: {
              exerciseId: ex.exerciseId,
              orderIndex: i,
              isAccessory: ex.isAccessory ?? false,
              isRequired: ex.isRequired ?? true,
              sets: ex.sets ?? 3,
              reps: ex.reps ?? 10,
              repsRaw: ex.repsRaw ?? (ex.reps ?? 10).toString(),
              targetWeight: ex.targetWeight ?? 0,
              addedWeight: ex.addedWeight ?? 0,
              isAmrap: ex.isAmrap ?? false,
              exerciseType: resolveSelectedExerciseType(ex),
              targetDuration: ex.targetDuration ?? null,
              targetDistance: ex.targetDistance ?? null,
              targetHeight: ex.targetHeight ?? null,
            },
          });
        }
      }

      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
      onSaved?.(savedTemplate);
      return savedTemplate;
    } catch (error) {
      if (error instanceof OfflineError || (error as any)?.name === 'OfflineError') {
        setOfflineMessage("Changes saved locally. Will sync when you're back online.");
      } else {
        Alert.alert(
          'Unable to save template',
          error instanceof Error ? error.message : 'Please try again.',
        );
      }
      setAutoSaveStatus('idle');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [mode, templateId, formData, selectedExercises, onSaved, userId]);

  const syncExercises = async (currentTemplateId: string, newTemplateId: string) => {
    const existingExercises = await apiFetch<Array<{ id: string; exerciseId: string }>>(
      `/api/templates/${currentTemplateId}/exercises`,
    );
    const existingIds = new Set(existingExercises.map((exercise) => exercise.id));
    const selectedPersistedIds = new Set(
      selectedExercises
        .filter((exercise) => existingIds.has(exercise.id))
        .map((exercise) => exercise.id),
    );

    const deletePromises = existingExercises
      .filter((existing) => !selectedPersistedIds.has(existing.id))
      .map((existing) =>
        apiFetch(`/api/templates/${currentTemplateId}/exercise-rows/${existing.id}`, {
          method: 'DELETE',
        }),
      );

    await Promise.all(deletePromises);

    const savePromises: Array<Promise<unknown>> = [];
    for (let i = 0; i < selectedExercises.length; i++) {
      const ex = selectedExercises[i];
      const body = {
        exerciseId: ex.exerciseId,
        orderIndex: i,
        isAccessory: ex.isAccessory ?? false,
        isRequired: ex.isRequired ?? true,
        sets: ex.sets ?? 3,
        reps: ex.reps ?? 10,
        repsRaw: ex.repsRaw ?? (ex.reps ?? 10).toString(),
        targetWeight: ex.targetWeight ?? 0,
        addedWeight: ex.addedWeight ?? 0,
        isAmrap: ex.isAmrap ?? false,
        exerciseType: resolveSelectedExerciseType(ex),
        targetDuration: ex.targetDuration ?? null,
        targetDistance: ex.targetDistance ?? null,
        targetHeight: ex.targetHeight ?? null,
      };
      const existing = existingIds.has(ex.id);
      savePromises.push(
        existing
          ? apiFetch(`/api/templates/${newTemplateId}/exercise-rows/${ex.id}`, {
              method: 'PUT',
              body,
            })
          : apiFetch(`/api/templates/${newTemplateId}/exercises`, {
              method: 'POST',
              body,
            }),
      );
    }

    await Promise.all(savePromises);
  };

  return {
    isLoading,
    isSaving,
    autoSaveStatus,
    offlineMessage,
    clearOfflineMessage: () => setOfflineMessage(null),
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
      exerciseType: resolveSelectedExerciseType(ex),
      id: ex.id || generateId(),
    })) ?? [];

  const {
    formData,
    selectedExercises,
    errors,
    validateForm,
    setFormData,
    addExercise,
    insertExerciseAfter,
    removeExercise,
    updateExercise,
    reorderExercises,
    pushUndo,
  } = useTemplateEditorState(initialFormData, initialExercises);

  const { saveTemplate, isSaving, offlineMessage, clearOfflineMessage } = useTemplateEditorApi({
    mode,
    templateId,
    formData,
    selectedExercises,
    onSaved,
  });

  const handleAddExercise = useCallback(
    (
      exercises: Array<{
        id: string;
        libraryId?: string | null;
        name: string;
        muscleGroup: string | null;
        exerciseType?: string;
        isAmrap?: boolean;
      }>,
    ) => {
      pushUndo();
      const buildSelectedExercise = (
        exercise: {
          id: string;
          libraryId?: string | null;
          name: string;
          muscleGroup: string | null;
          exerciseType?: string;
          isAmrap?: boolean;
        },
        isAmrap: boolean,
      ): SelectedExercise => ({
        id: generateId(),
        exerciseId: exercise.id,
        libraryId: exercise.libraryId ?? undefined,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        exerciseType: resolveSelectedExerciseType(exercise),
        isAmrap,
        isAccessory: false,
        isRequired: true,
        sets: isAmrap ? 1 : 3,
        reps: 10,
        repsRaw: '10',
        targetWeight: 0,
      });

      for (const exercise of exercises) {
        if (exercise.isAmrap) {
          Alert.alert(exercise.name, 'How do you want to add AMRAP?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: `Make this ${exercise.name} AMRAP only`,
              onPress: () => addExercise(buildSelectedExercise(exercise, true)),
            },
            {
              text: `Add ${exercise.name} + ${exercise.name} AMRAP`,
              onPress: () => {
                addExercise(buildSelectedExercise(exercise, false));
                addExercise(buildSelectedExercise(exercise, true));
              },
            },
          ]);
          continue;
        }

        addExercise(buildSelectedExercise(exercise, false));
      }
    },
    [pushUndo, addExercise],
  );

  const handleUpdateExercise = useCallback(
    (id: string, updates: Partial<SelectedExercise>) => {
      pushUndo();
      updateExercise(id, updates);
    },
    [pushUndo, updateExercise],
  );

  const promptForAmrapSplit = useCallback(
    (exercise: SelectedExercise) => {
      const hasNormalRow = selectedExercises.some(
        (candidate) =>
          candidate.id !== exercise.id &&
          candidate.exerciseId === exercise.exerciseId &&
          !candidate.isAmrap,
      );

      if (hasNormalRow) {
        handleUpdateExercise(exercise.id, { isAmrap: true, sets: exercise.sets ?? 1 });
        return;
      }

      Alert.alert(exercise.name, 'How do you want to add AMRAP?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Make this ${exercise.name} AMRAP only`,
          onPress: () => handleUpdateExercise(exercise.id, { isAmrap: true }),
        },
        {
          text: `Add ${exercise.name} + ${exercise.name} AMRAP`,
          onPress: () => {
            pushUndo();
            updateExercise(exercise.id, { isAmrap: false });
            insertExerciseAfter(exercise.id, {
              ...exercise,
              id: generateId(),
              isAmrap: true,
              sets: 1,
              reps: exercise.reps ?? 10,
              repsRaw: exercise.repsRaw ?? (exercise.reps ?? 10).toString(),
            });
          },
        },
      ]);
    },
    [handleUpdateExercise, insertExerciseAfter, pushUndo, selectedExercises, updateExercise],
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

  const handleSave = useCallback(async () => {
    clearOfflineMessage();
    if (!validateForm()) return;
    const result = await saveTemplate();
    if (result && onSaved) {
      onSaved(result);
    }
  }, [clearOfflineMessage, validateForm, saveTemplate, onSaved]);

  const handleCancel = useCallback(() => {
    clearOfflineMessage();
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
  }, [clearOfflineMessage, mode, formData.name, selectedExercises.length, onClose]);

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

                  <View style={styles.typeRow}>
                    {(['weighted', 'bodyweight', 'timed', 'cardio', 'plyo'] as const).map(
                      (type) => {
                        const isSelected = (exercise.exerciseType ?? 'weighted') === type;
                        return (
                          <Pressable
                            key={`ex-type:${exercise.id}:${type}`}
                            onPress={() =>
                              handleUpdateExercise(exercise.id, { exerciseType: type })
                            }
                            style={[
                              styles.typeChip,
                              isSelected ? styles.typeChipSelected : styles.typeChipDefault,
                            ]}
                          >
                            <Text
                              style={[
                                styles.typeChipText,
                                isSelected
                                  ? styles.typeChipTextSelected
                                  : styles.typeChipTextDefault,
                              ]}
                            >
                              {type.charAt(0).toUpperCase() + type.slice(1)}
                            </Text>
                          </Pressable>
                        );
                      },
                    )}
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
                          style={[styles.counterButton, { left: 0 }]}
                        >
                          <Text style={styles.counterButtonText}>-</Text>
                        </Pressable>
                        <TextInput
                          style={styles.counterInput}
                          keyboardType="numeric"
                          selectTextOnFocus
                          value={exercise.sets?.toString() ?? ''}
                          onChangeText={(text) => {
                            const num = parseInt(text, 10);
                            updateExercise(exercise.id, { sets: isNaN(num) ? undefined : num });
                          }}
                          onBlur={() => {
                            const current = exercise.sets ?? 3;
                            updateExercise(exercise.id, { sets: Math.max(1, current) });
                          }}
                        />
                        <Pressable
                          onPress={() => {
                            const currentSets = exercise.sets ?? 3;
                            const newSets = currentSets + 1;
                            handleUpdateExercise(exercise.id, { sets: newSets });
                          }}
                          style={[styles.counterButton, { right: 0 }]}
                        >
                          <Text style={styles.counterButtonText}>+</Text>
                        </Pressable>
                      </View>
                    </View>

                    {(exercise.exerciseType === 'weighted' ||
                      exercise.exerciseType === 'bodyweight' ||
                      exercise.exerciseType === 'plyo' ||
                      !exercise.exerciseType) && (
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
                            style={[styles.counterButton, { left: 0 }]}
                          >
                            <Text style={styles.counterButtonText}>-</Text>
                          </Pressable>
                          <TextInput
                            style={styles.counterInput}
                            keyboardType="numeric"
                            selectTextOnFocus
                            value={exercise.repsRaw ?? (exercise.reps ?? 10).toString()}
                            onChangeText={(text) => {
                              const num = parseInt(text, 10);
                              updateExercise(exercise.id, {
                                reps: isNaN(num) ? undefined : num,
                                repsRaw: text,
                              });
                            }}
                            onBlur={() => {
                              const current = exercise.reps ?? 10;
                              const normalized = Math.max(1, current);
                              updateExercise(exercise.id, {
                                reps: normalized,
                                repsRaw: normalized.toString(),
                              });
                            }}
                          />
                          <Pressable
                            onPress={() => {
                              const currentReps = exercise.reps ?? 10;
                              const newReps = currentReps + 1;
                              handleUpdateExercise(exercise.id, {
                                reps: newReps,
                                repsRaw: newReps.toString(),
                              });
                            }}
                            style={[styles.counterButton, { right: 0 }]}
                          >
                            <Text style={styles.counterButtonText}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}

                    {(exercise.exerciseType === 'weighted' ||
                      exercise.exerciseType === 'bodyweight' ||
                      !exercise.exerciseType) && (
                      <View style={styles.exerciseField}>
                        <Text style={styles.fieldLabel}>Weight</Text>
                        <View style={styles.counterContainer}>
                          <Pressable
                            onPress={() => {
                              const currentWeight = exercise.targetWeight ?? 0;
                              const newWeight = Math.max(0, currentWeight - 5);
                              handleUpdateExercise(exercise.id, { targetWeight: newWeight });
                            }}
                            style={[styles.counterButton, { left: 0 }]}
                          >
                            <Text style={styles.counterButtonText}>-</Text>
                          </Pressable>
                          <TextInput
                            style={styles.counterInput}
                            keyboardType="numeric"
                            selectTextOnFocus
                            value={exercise.targetWeight?.toString() ?? '0'}
                            onChangeText={(text) => {
                              const num = parseInt(text, 10);
                              updateExercise(exercise.id, {
                                targetWeight: isNaN(num) ? undefined : num,
                              });
                            }}
                            onBlur={() => {
                              const current = exercise.targetWeight ?? 0;
                              updateExercise(exercise.id, {
                                targetWeight: Math.max(0, current),
                              });
                            }}
                          />
                          <Pressable
                            onPress={() => {
                              const currentWeight = exercise.targetWeight ?? 0;
                              const newWeight = currentWeight + 5;
                              handleUpdateExercise(exercise.id, { targetWeight: newWeight });
                            }}
                            style={[styles.counterButton, { right: 0 }]}
                          >
                            <Text style={styles.counterButtonText}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}

                    {(exercise.exerciseType === 'timed' || exercise.exerciseType === 'cardio') && (
                      <View style={styles.exerciseField}>
                        <Text style={styles.fieldLabel}>Duration (s)</Text>
                        <View style={styles.counterContainer}>
                          <Pressable
                            onPress={() => {
                              const current = exercise.targetDuration ?? 0;
                              const newValue = Math.max(0, current - 5);
                              handleUpdateExercise(exercise.id, { targetDuration: newValue });
                            }}
                            style={[styles.counterButton, { left: 0 }]}
                          >
                            <Text style={styles.counterButtonText}>-</Text>
                          </Pressable>
                          <TextInput
                            style={styles.counterInput}
                            keyboardType="numeric"
                            selectTextOnFocus
                            value={exercise.targetDuration?.toString() ?? '0'}
                            onChangeText={(text) => {
                              const num = parseInt(text, 10);
                              updateExercise(exercise.id, {
                                targetDuration: isNaN(num) ? undefined : num,
                              });
                            }}
                            onBlur={() => {
                              const current = exercise.targetDuration ?? 0;
                              updateExercise(exercise.id, {
                                targetDuration: Math.max(0, current),
                              });
                            }}
                          />
                          <Pressable
                            onPress={() => {
                              const current = exercise.targetDuration ?? 0;
                              const newValue = current + 5;
                              handleUpdateExercise(exercise.id, { targetDuration: newValue });
                            }}
                            style={[styles.counterButton, { right: 0 }]}
                          >
                            <Text style={styles.counterButtonText}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}

                    {exercise.exerciseType === 'cardio' && (
                      <View style={styles.exerciseField}>
                        <Text style={styles.fieldLabel}>Distance</Text>
                        <View style={styles.counterContainer}>
                          <Pressable
                            onPress={() => {
                              const current = exercise.targetDistance ?? 0;
                              const newValue = Math.max(0, current - 1);
                              handleUpdateExercise(exercise.id, { targetDistance: newValue });
                            }}
                            style={[styles.counterButton, { left: 0 }]}
                          >
                            <Text style={styles.counterButtonText}>-</Text>
                          </Pressable>
                          <TextInput
                            style={styles.counterInput}
                            keyboardType="numeric"
                            selectTextOnFocus
                            value={exercise.targetDistance?.toString() ?? '0'}
                            onChangeText={(text) => {
                              const num = parseInt(text, 10);
                              updateExercise(exercise.id, {
                                targetDistance: isNaN(num) ? undefined : num,
                              });
                            }}
                            onBlur={() => {
                              const current = exercise.targetDistance ?? 0;
                              updateExercise(exercise.id, {
                                targetDistance: Math.max(0, current),
                              });
                            }}
                          />
                          <Pressable
                            onPress={() => {
                              const current = exercise.targetDistance ?? 0;
                              const newValue = current + 1;
                              handleUpdateExercise(exercise.id, { targetDistance: newValue });
                            }}
                            style={[styles.counterButton, { right: 0 }]}
                          >
                            <Text style={styles.counterButtonText}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}

                    {exercise.exerciseType === 'plyo' && (
                      <View style={styles.exerciseField}>
                        <Text style={styles.fieldLabel}>Height (cm)</Text>
                        <View style={styles.counterContainer}>
                          <Pressable
                            onPress={() => {
                              const current = exercise.targetHeight ?? 0;
                              const newValue = Math.max(0, current - 5);
                              handleUpdateExercise(exercise.id, { targetHeight: newValue });
                            }}
                            style={[styles.counterButton, { left: 0 }]}
                          >
                            <Text style={styles.counterButtonText}>-</Text>
                          </Pressable>
                          <TextInput
                            style={styles.counterInput}
                            keyboardType="numeric"
                            selectTextOnFocus
                            value={exercise.targetHeight?.toString() ?? '0'}
                            onChangeText={(text) => {
                              const num = parseInt(text, 10);
                              updateExercise(exercise.id, {
                                targetHeight: isNaN(num) ? undefined : num,
                              });
                            }}
                            onBlur={() => {
                              const current = exercise.targetHeight ?? 0;
                              updateExercise(exercise.id, {
                                targetHeight: Math.max(0, current),
                              });
                            }}
                          />
                          <Pressable
                            onPress={() => {
                              const current = exercise.targetHeight ?? 0;
                              const newValue = current + 5;
                              handleUpdateExercise(exercise.id, { targetHeight: newValue });
                            }}
                            style={[styles.counterButton, { right: 0 }]}
                          >
                            <Text style={styles.counterButtonText}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>

                  <View style={styles.toggleRow}>
                    <Pressable
                      onPress={() => {
                        if (exercise.isAmrap) {
                          handleUpdateExercise(exercise.id, { isAmrap: false });
                        } else {
                          promptForAmrapSplit(exercise);
                        }
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

      {offlineMessage && (
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: 'rgba(239, 68, 68, 0.2)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            paddingHorizontal: 16,
            paddingVertical: 12,
            marginHorizontal: 16,
            marginBottom: 8,
          }}
        >
          <Text style={{ fontSize: 14, color: colors.error }}>{offlineMessage}</Text>
        </View>
      )}

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
    top: 0,
    bottom: 0,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  counterButtonText: {
    fontSize: typography.fontSizes.lg,
    color: colors.textMuted,
  },
  counterInput: {
    flex: 1,
    fontSize: typography.fontSizes.base,
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  typeChip: {
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  typeChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  typeChipDefault: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  typeChipText: {
    fontSize: typography.fontSizes.xs,
  },
  typeChipTextSelected: {
    color: colors.text,
  },
  typeChipTextDefault: {
    color: colors.textMuted,
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
