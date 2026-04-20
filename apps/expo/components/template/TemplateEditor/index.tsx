import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Collapsible } from '@/components/ui/Collapsible';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ExerciseSearch } from '@/components/workout/ExerciseSearch';
import { useUndo } from '@/hooks/useUndo';
import type { TemplateEditorProps, SelectedExercise, Template } from './types';

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

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || undefined,
          notes: formData.notes || undefined,
        }),
      });
      console.log('Response status:', res.status);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to save template');
      }

      const savedTemplate: Template = await res.json();

      if (!isNew && templateId) {
        await syncExercises(templateId, savedTemplate.id);
      } else {
        for (let i = 0; i < selectedExercises.length; i++) {
          const ex = selectedExercises[i];
          await fetch(`/api/templates/${savedTemplate.id}/exercises`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
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

  const syncExercises = async (currentTemplateId: string, _newTemplateId: string) => {
    const newExerciseIds = new Set(selectedExercises.map((e) => e.exerciseId));

    const existingRes = await fetch(`/api/templates/${currentTemplateId}/exercises`, {
      credentials: 'include',
    });
    const existingExercises: Array<{ exerciseId: string; orderIndex: number }> =
      await existingRes.json();

    const deletePromises = existingExercises
      .filter((existing) => !newExerciseIds.has(existing.exerciseId))
      .map((existing) =>
        fetch(`/api/templates/${currentTemplateId}/exercises/${existing.exerciseId}`, {
          method: 'DELETE',
          credentials: 'include',
        }),
      );

    await Promise.all(deletePromises);

    const addPromises: Array<Promise<Response>> = [];
    for (let i = 0; i < selectedExercises.length; i++) {
      const ex = selectedExercises[i];
      const existing = existingExercises.find((ee) => ee.exerciseId === ex.exerciseId);
      if (!existing) {
        addPromises.push(
          fetch(`/api/templates/${currentTemplateId}/exercises`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
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
    (exercise: { id: string; name: string; muscleGroup: string | null }) => {
      pushUndo();
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
    <View className="flex-1 bg-darkBg">
      <View className="flex-row items-center justify-between border-b border-darkBorder bg-darkCard px-4 py-3">
        <Pressable
          onPress={handleCancel}
          className="h-10 w-10 items-center justify-center rounded-lg active:bg-darkBorder"
        >
          <Text className="text-darkText text-xl">←</Text>
        </Pressable>
        <Text className="text-darkText text-lg font-semibold">
          {mode === 'create' ? 'Create Template' : 'Edit Template'}
        </Text>
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={handleUndo}
            disabled={!canUndo}
            className={`h-10 w-10 items-center justify-center rounded-lg ${canUndo ? 'active:bg-darkBorder' : 'opacity-30'}`}
          >
            <Text className="text-darkText text-lg">↩</Text>
          </Pressable>
          <Pressable
            onPress={handleRedo}
            disabled={!canRedo}
            className={`h-10 w-10 items-center justify-center rounded-lg ${canRedo ? 'active:bg-darkBorder' : 'opacity-30'}`}
          >
            <Text className="text-darkText text-lg">↪</Text>
          </Pressable>
        </View>
      </View>

      {mode === 'edit' && (
        <View className="flex-row items-center justify-end px-4 py-2">
          <View className="flex-row items-center gap-2">
            {autoSaveStatus === 'saving' && (
              <>
                <ActivityIndicator size="small" color="#ef6f4f" />
                <Text className="text-darkMuted text-xs">Saving...</Text>
              </>
            )}
            {autoSaveStatus === 'saved' && <Text className="text-green-400 text-xs">Saved</Text>}
          </View>
        </View>
      )}

      <ScrollView className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 100 }}>
        <View className="mb-4">
          <Text className="text-darkMuted mb-2 text-xs font-medium uppercase">Template Name *</Text>
          <Input
            placeholder="Enter template name"
            value={formData.name}
            onChangeText={(text) => setFormData({ name: text })}
          />
          {errors.name && <Text className="text-red-400 mt-1 text-xs">{errors.name}</Text>}
        </View>

        <View className="mb-4">
          <Text className="text-darkMuted mb-2 text-xs font-medium uppercase">Description</Text>
          <Input
            placeholder="Enter description (optional)"
            value={formData.description}
            onChangeText={(text) => setFormData({ description: text })}
          />
        </View>

        <Collapsible label="Notes" className="mb-4">
          <Input
            placeholder="Enter notes (optional)"
            value={formData.notes}
            onChangeText={(text) => setFormData({ notes: text })}
            className="h-24"
          />
        </Collapsible>

        <View className="mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-darkMuted text-xs font-medium uppercase">
              Exercises ({currentExercises.length})
            </Text>
            <Pressable
              onPress={() => setShowExerciseSearch(true)}
              className="flex-row items-center gap-1 rounded-full bg-coral px-4 py-2 active:scale-95"
            >
              <Text className="text-white text-sm font-semibold">+ Add Exercise</Text>
            </Pressable>
          </View>

          {currentExercises.length === 0 ? (
            <Card className="items-center justify-center py-8">
              <Text className="text-darkMuted text-sm">No exercises added yet</Text>
              <Text className="text-darkMuted mt-1 text-xs">
                Tap "+ Add Exercise" to get started
              </Text>
            </Card>
          ) : (
            <View className="gap-3">
              {currentExercises.map((exercise, index) => (
                <Card key={exercise.id} className="p-4">
                  <View className="mb-3 flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-darkText text-base font-semibold">{exercise.name}</Text>
                      {exercise.muscleGroup && (
                        <Text className="text-darkMuted text-xs">{exercise.muscleGroup}</Text>
                      )}
                    </View>
                    <View className="flex-row items-center gap-1">
                      <Pressable
                        onPress={() => handleMoveUp(index)}
                        disabled={index === 0}
                        className={`h-8 w-8 items-center justify-center rounded-lg ${index === 0 ? 'opacity-30' : 'bg-darkBorder'}`}
                      >
                        <Text className="text-darkText text-sm">↑</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleMoveDown(index)}
                        disabled={index === currentExercises.length - 1}
                        className={`h-8 w-8 items-center justify-center rounded-lg ${index === currentExercises.length - 1 ? 'opacity-30' : 'bg-darkBorder'}`}
                      >
                        <Text className="text-darkText text-sm">↓</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleRemoveExercise(exercise.id)}
                        className="ml-2 h-8 w-8 items-center justify-center rounded-lg bg-red-500/20"
                      >
                        <Text className="text-red-400 text-sm">×</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Text className="text-darkMuted mb-1 text-xs">Sets</Text>
                      <View className="rounded-lg border border-darkBorder bg-darkBg px-3 py-2">
                        <Pressable
                          onPress={() => {
                            const currentSets = exercise.sets ?? 3;
                            const newSets = currentSets > 1 ? currentSets - 1 : 1;
                            handleUpdateExercise(exercise.id, { sets: newSets });
                          }}
                          className="absolute left-1 top-0 bottom-0 w-8 items-center justify-center"
                        >
                          <Text className="text-darkMuted text-lg">-</Text>
                        </Pressable>
                        <Text className="text-center text-darkText">{exercise.sets ?? 3}</Text>
                        <Pressable
                          onPress={() => {
                            const currentSets = exercise.sets ?? 3;
                            const newSets = currentSets + 1;
                            handleUpdateExercise(exercise.id, { sets: newSets });
                          }}
                          className="absolute right-1 top-0 bottom-0 w-8 items-center justify-center"
                        >
                          <Text className="text-darkMuted text-lg">+</Text>
                        </Pressable>
                      </View>
                    </View>
                    <View className="flex-1">
                      <Text className="text-darkMuted mb-1 text-xs">Reps</Text>
                      <View className="rounded-lg border border-darkBorder bg-darkBg px-3 py-2">
                        <Pressable
                          onPress={() => {
                            const currentReps = exercise.reps ?? 10;
                            const newReps = currentReps > 1 ? currentReps - 1 : 1;
                            handleUpdateExercise(exercise.id, {
                              reps: newReps,
                              repsRaw: newReps.toString(),
                            });
                          }}
                          className="absolute left-1 top-0 bottom-0 w-8 items-center justify-center"
                        >
                          <Text className="text-darkMuted text-lg">-</Text>
                        </Pressable>
                        <Text className="text-center text-darkText">
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
                          className="absolute right-1 top-0 bottom-0 w-8 items-center justify-center"
                        >
                          <Text className="text-darkMuted text-lg">+</Text>
                        </Pressable>
                      </View>
                    </View>
                    <View className="flex-1">
                      <Text className="text-darkMuted mb-1 text-xs">Weight</Text>
                      <View className="rounded-lg border border-darkBorder bg-darkBg px-3 py-2">
                        <Pressable
                          onPress={() => {
                            const currentWeight = exercise.targetWeight ?? 0;
                            const newWeight = Math.max(0, currentWeight - 5);
                            handleUpdateExercise(exercise.id, { targetWeight: newWeight });
                          }}
                          className="absolute left-1 top-0 bottom-0 w-8 items-center justify-center"
                        >
                          <Text className="text-darkMuted text-lg">-</Text>
                        </Pressable>
                        <Text className="text-center text-darkText">
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
                          className="absolute right-1 top-0 bottom-0 w-8 items-center justify-center"
                        >
                          <Text className="text-darkMuted text-lg">+</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>

                  <View className="mt-3 flex-row gap-4">
                    <Pressable
                      onPress={() =>
                        handleUpdateExercise(exercise.id, { isAmrap: !exercise.isAmrap })
                      }
                      className={`flex-row items-center gap-2 rounded-lg px-3 py-2 ${exercise.isAmrap ? 'bg-coral/20' : 'bg-darkBorder'}`}
                    >
                      <View
                        className={`h-4 w-4 rounded ${exercise.isAmrap ? 'bg-coral' : 'border border-darkMuted'}`}
                      />
                      <Text
                        className={`text-xs ${exercise.isAmrap ? 'text-coral' : 'text-darkMuted'}`}
                      >
                        AMRAP
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        handleUpdateExercise(exercise.id, { isAccessory: !exercise.isAccessory })
                      }
                      className={`flex-row items-center gap-2 rounded-lg px-3 py-2 ${exercise.isAccessory ? 'bg-darkBorder' : 'bg-transparent'}`}
                    >
                      <View
                        className={`h-4 w-4 rounded border ${exercise.isAccessory ? 'bg-darkMuted border-darkMuted' : 'border-darkMuted'}`}
                      />
                      <Text
                        className={`text-xs ${exercise.isAccessory ? 'text-darkText' : 'text-darkMuted'}`}
                      >
                        Accessory
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        handleUpdateExercise(exercise.id, { isRequired: !exercise.isRequired })
                      }
                      className={`flex-row items-center gap-2 rounded-lg px-3 py-2 ${!exercise.isRequired ? 'bg-darkBorder' : 'bg-transparent'}`}
                    >
                      <View
                        className={`h-4 w-4 rounded ${!exercise.isRequired ? 'bg-darkMuted' : 'border border-darkMuted'}`}
                      />
                      <Text
                        className={`text-xs ${!exercise.isRequired ? 'text-darkText' : 'text-darkMuted'}`}
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
      </ScrollView>

      <View className="flex-row gap-3 border-t border-darkBorder bg-darkCard p-4">
        <Button variant="outline" onPress={handleCancel} className="flex-1">
          <Text className="text-darkText font-semibold">Cancel</Text>
        </Button>
        <Button onPress={handleSave} disabled={isSaving} className="flex-1">
          {isSaving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text className="text-white font-semibold">Save Template</Text>
          )}
        </Button>
      </View>

      <BottomSheet
        visible={showExerciseSearch}
        onClose={() => setShowExerciseSearch(false)}
        title="Add Exercise"
      >
        <ExerciseSearch
          onSelect={handleAddExercise}
          onClose={() => setShowExerciseSearch(false)}
          excludeIds={currentExercises.map((e) => e.exerciseId)}
        />
      </BottomSheet>
    </View>
  );
}
