import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import { useScrollToInput } from '@/context/ScrollContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, statusBg } from '@/theme';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { FormScrollView } from '@/components/ui/FormScrollView';
import { ExerciseSearch } from '@/components/workout/ExerciseSearch';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/api';
import { OfflineError, tryOnlineOrEnqueue } from '@/lib/offline-mutation';
import { generateId, getDefaultLiftForExercise } from '@strength/db/client';
import { deleteLocalCustomProgram, upsertLocalCustomProgramSnapshot } from '@/db/training-cache';
import { toDisplayHeight, toStorageHeight } from '@/lib/units';
import type { CustomProgramWithWorkouts } from '@/hooks/useCustomPrograms';

type ExerciseType = 'weights' | 'bodyweight' | 'timed' | 'cardio' | 'plyo';

function generateLocalId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function normalizeExerciseType(exerciseType: string | null | undefined): ExerciseType {
  return ['weights', 'bodyweight', 'timed', 'cardio', 'plyo'].includes(exerciseType ?? '')
    ? (exerciseType as ExerciseType)
    : 'weights';
}

function getDefaultSets(exerciseType: string | null | undefined, isAmrap?: boolean): number {
  if (isAmrap) return 1;
  if (exerciseType === 'cardio' || exerciseType === 'timed') return 1;
  if (exerciseType === 'weights') return 4;
  return 3;
}

function getDefaultReps(exerciseType: string | null | undefined): number {
  return exerciseType === 'weights' ? 5 : 10;
}

function getExerciseTypeDefaults(exerciseType: string | null | undefined, isAmrap?: boolean) {
  const type = normalizeExerciseType(exerciseType);
  return {
    exerciseType: type,
    sets: getDefaultSets(type, isAmrap),
    reps: getDefaultReps(type),
    repsRaw: getDefaultReps(type).toString(),
    weightMode: type === 'weights' ? null : null,
    fixedWeight: 0,
    targetDuration: type === 'timed' || type === 'cardio' ? 60 : null,
    targetDistance: type === 'cardio' ? 400 : null,
    targetHeight: type === 'plyo' ? 60 : null,
  } satisfies Pick<
    ExerciseDraft,
    | 'exerciseType'
    | 'sets'
    | 'reps'
    | 'repsRaw'
    | 'weightMode'
    | 'fixedWeight'
    | 'targetDuration'
    | 'targetDistance'
    | 'targetHeight'
  >;
}

function buildExerciseDraft(
  exercise: {
    id: string;
    name: string;
    muscleGroup: string | null;
    libraryId?: string | null;
    exerciseType?: string;
  },
  isAmrap: boolean,
): ExerciseDraft {
  const typeDefaults = getExerciseTypeDefaults(exercise.exerciseType ?? 'weights', isAmrap);
  return {
    localId: generateLocalId(),
    exerciseId: exercise.id,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup,
    libraryId: exercise.libraryId ?? undefined,
    ...typeDefaults,
    percentageOfLift: 75,
    percentageLift: getDefaultLiftForExercise(exercise.libraryId),
    addedWeight: 0,
    isAmrap,
    isAccessory: false,
    isRequired: true,
    setNumber: null,
    progressionAmount: 0,
    progressionInterval: 1,
    progressionType: 'fixed',
  };
}

function getSaveReadyExercise(exercise: ExerciseDraft) {
  const type = normalizeExerciseType(exercise.exerciseType);
  return {
    ...exercise,
    exerciseType: type,
    repsRaw: exercise.repsRaw || String(exercise.reps ?? getDefaultReps(type)),
    weightMode: type === 'weights' ? exercise.weightMode : null,
    fixedWeight: type === 'weights' || type === 'bodyweight' ? (exercise.fixedWeight ?? 0) : null,
    targetDuration: type === 'timed' || type === 'cardio' ? (exercise.targetDuration ?? 60) : null,
    targetDistance: type === 'cardio' ? (exercise.targetDistance ?? 400) : null,
    targetHeight: type === 'plyo' ? (exercise.targetHeight ?? 60) : null,
  };
}

interface ExerciseDraft {
  localId: string;
  exerciseId: string;
  name: string;
  muscleGroup: string | null;
  libraryId?: string;
  exerciseType: string;
  sets: number;
  reps: number;
  repsRaw: string;
  weightMode: 'fixed' | 'percentage' | 'prompt_1rm' | 'from_history' | null;
  fixedWeight: number;
  percentageOfLift: number;
  percentageLift: string;
  addedWeight: number;
  targetDuration: number | null;
  targetDistance: number | null;
  targetHeight: number | null;
  isAmrap: boolean;
  isAccessory: boolean;
  isRequired: boolean;
  setNumber: number | null;
  progressionAmount: number;
  progressionInterval: number;
  progressionType: 'fixed' | 'percentage';
}

interface WorkoutDraft {
  localId: string;
  serverId: string | null;
  dayIndex: number;
  name: string;
  orderIndex: number;
  exercises: ExerciseDraft[];
}

interface FormState {
  name: string;
  description: string;
  notes: string;
  daysPerWeek: number;
  weeks: number;
}

interface Props {
  initialData?: CustomProgramWithWorkouts;
  onSaved?: (program: { id: string; name: string }) => void;
  onDeleted?: (programId: string) => void;
  onClose?: () => void;
}

export default function CustomProgramEditor({ initialData, onSaved, onDeleted, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { weightUnit, heightUnit } = useUserPreferences();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const [formState, setFormState] = useState<FormState>({
    name: initialData?.name ?? '',
    description: initialData?.description ?? '',
    notes: initialData?.notes ?? '',
    daysPerWeek: initialData?.daysPerWeek ?? 3,
    weeks: initialData?.weeks ?? 8,
  });

  const initWorkouts = (): WorkoutDraft[] => {
    if (initialData?.workouts && initialData.workouts.length > 0) {
      return initialData.workouts.map((w) => ({
        localId: w.id,
        serverId: w.id,
        dayIndex: w.dayIndex,
        name: w.name,
        orderIndex: w.orderIndex,
        exercises: w.exercises.map((e) => ({
          localId: e.id,
          exerciseId: e.exerciseId,
          name: e.name,
          muscleGroup: null,
          libraryId: e.libraryId ?? undefined,
          exerciseType: e.exerciseType,
          sets: e.sets ?? 3,
          reps: e.reps ?? 10,
          repsRaw: e.repsRaw ?? (e.reps ?? 10).toString(),
          weightMode: (e.weightMode as ExerciseDraft['weightMode']) ?? null,
          fixedWeight: e.fixedWeight ?? 0,
          percentageOfLift: e.percentageOfLift ?? 75,
          percentageLift: e.percentageLift ?? getDefaultLiftForExercise(e.libraryId),
          addedWeight: e.addedWeight ?? 0,
          targetDuration: e.targetDuration,
          targetDistance: e.targetDistance,
          targetHeight: e.targetHeight,
          isAmrap: e.isAmrap,
          isAccessory: e.isAccessory,
          isRequired: e.isRequired,
          setNumber: e.setNumber,
          progressionAmount: e.progressionAmount ?? 0,
          progressionInterval: e.progressionInterval ?? 1,
          progressionType: (e.progressionType as ExerciseDraft['progressionType']) ?? 'fixed',
        })),
      }));
    }
    // Default: create empty workouts for each day
    return Array.from({ length: formState.daysPerWeek }, (_, i) => ({
      localId: generateLocalId(),
      serverId: null as string | null,
      dayIndex: i,
      name: `Day ${i + 1}`,
      orderIndex: i,
      exercises: [] as ExerciseDraft[],
    }));
  };

  const [workouts, setWorkouts] = useState<WorkoutDraft[]>(initWorkouts);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [offlineMessage, setOfflineMessage] = useState<string | null>(null);
  const [showExerciseSearch, setShowExerciseSearch] = useState(false);
  const [activeWorkoutIndex, setActiveWorkoutIndex] = useState<number | null>(null);
  const [errors, setErrors] = useState<{ name?: string }>({});

  const updateForm = useCallback(
    (updates: Partial<FormState>) => {
      setFormState((prev) => {
        const next = { ...prev, ...updates };
        // Reset workouts if daysPerWeek changed
        if (updates.daysPerWeek && updates.daysPerWeek !== prev.daysPerWeek) {
          const newWorkouts = [...workouts];
          if (updates.daysPerWeek > prev.daysPerWeek) {
            for (let i = prev.daysPerWeek; i < updates.daysPerWeek; i++) {
              newWorkouts.push({
                localId: generateLocalId(),
                serverId: null,
                dayIndex: i,
                name: `Day ${i + 1}`,
                orderIndex: i,
                exercises: [],
              });
            }
          } else {
            newWorkouts.splice(updates.daysPerWeek);
          }
          // Use setTimeout to update workouts outside of render
          setTimeout(() => setWorkouts(newWorkouts), 0);
        }
        return next;
      });
    },
    [workouts],
  );

  const updateWorkout = useCallback((index: number, updates: Partial<WorkoutDraft>) => {
    setWorkouts((prev) => prev.map((w, i) => (i === index ? { ...w, ...updates } : w)));
  }, []);

  const addExerciseToWorkout = useCallback(
    (
      workoutIndex: number,
      exercises: Array<{
        id: string;
        name: string;
        muscleGroup: string | null;
        libraryId?: string | null;
        exerciseType?: string;
        isAmrap?: boolean;
      }>,
    ) => {
      const appendExercise = (exercise: ExerciseDraft) => {
        setWorkouts((prev) =>
          prev.map((w, i) =>
            i === workoutIndex ? { ...w, exercises: [...w.exercises, exercise] } : w,
          ),
        );
      };

      for (const ex of exercises) {
        if (ex.isAmrap) {
          Alert.alert(ex.name, 'How do you want to add AMRAP?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: `Make this ${ex.name} AMRAP only`,
              onPress: () => appendExercise(buildExerciseDraft(ex, true)),
            },
            {
              text: `Add ${ex.name} + ${ex.name} AMRAP`,
              onPress: () => {
                appendExercise(buildExerciseDraft(ex, false));
                appendExercise(buildExerciseDraft(ex, true));
              },
            },
          ]);
          continue;
        }

        appendExercise(buildExerciseDraft(ex, false));
      }
    },
    [],
  );

  const updateExerciseInWorkout = useCallback(
    (workoutIndex: number, localId: string, updates: Partial<ExerciseDraft>) => {
      setWorkouts((prev) =>
        prev.map((w, i) =>
          i === workoutIndex
            ? {
                ...w,
                exercises: w.exercises.map((e) =>
                  e.localId === localId ? { ...e, ...updates } : e,
                ),
              }
            : w,
        ),
      );
    },
    [],
  );

  const removeExerciseFromWorkout = useCallback((workoutIndex: number, localId: string) => {
    setWorkouts((prev) =>
      prev.map((w, i) =>
        i === workoutIndex
          ? { ...w, exercises: w.exercises.filter((e) => e.localId !== localId) }
          : w,
      ),
    );
  }, []);

  const promptForAmrapSplit = useCallback(
    (workoutIndex: number, exercise: ExerciseDraft) => {
      const hasNormalRow = workouts[workoutIndex]?.exercises.some(
        (candidate) =>
          candidate.localId !== exercise.localId &&
          candidate.exerciseId === exercise.exerciseId &&
          !candidate.isAmrap,
      );

      if (hasNormalRow) {
        updateExerciseInWorkout(workoutIndex, exercise.localId, { isAmrap: true, sets: 1 });
        return;
      }

      Alert.alert(exercise.name, 'How do you want to add AMRAP?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Make this ${exercise.name} AMRAP only`,
          onPress: () =>
            updateExerciseInWorkout(workoutIndex, exercise.localId, { isAmrap: true, sets: 1 }),
        },
        {
          text: `Add ${exercise.name} + ${exercise.name} AMRAP`,
          onPress: () => {
            setWorkouts((prev) =>
              prev.map((w, i) => {
                if (i !== workoutIndex) return w;

                const exerciseIndex = w.exercises.findIndex((e) => e.localId === exercise.localId);
                if (exerciseIndex === -1) return w;

                const nextExercises = [...w.exercises];
                nextExercises[exerciseIndex] = {
                  ...nextExercises[exerciseIndex],
                  isAmrap: false,
                };
                nextExercises.splice(exerciseIndex + 1, 0, {
                  ...exercise,
                  localId: generateLocalId(),
                  isAmrap: true,
                  sets: 1,
                  reps: exercise.reps ?? 10,
                  repsRaw: exercise.repsRaw ?? (exercise.reps ?? 10).toString(),
                });
                return { ...w, exercises: nextExercises };
              }),
            );
          },
        },
      ]);
    },
    [updateExerciseInWorkout, workouts],
  );

  const moveExercise = useCallback((workoutIndex: number, fromIndex: number, toIndex: number) => {
    setWorkouts((prev) =>
      prev.map((w, i) => {
        if (i !== workoutIndex) return w;
        const next = [...w.exercises];
        const [removed] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, removed);
        return { ...w, exercises: next };
      }),
    );
  }, []);

  const validate = useCallback((): boolean => {
    const newErrors: { name?: string } = {};
    if (!formState.name.trim()) {
      newErrors.name = 'Program name is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formState.name]);

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    if (!userId) {
      Alert.alert('Not authenticated', 'Please sign in to save custom programs.');
      return;
    }

    setIsSaving(true);
    setOfflineMessage(null);

    const programId = initialData?.id ?? generateId();
    const programPayload = {
      id: programId,
      name: formState.name,
      description: formState.description || undefined,
      notes: formState.notes || undefined,
      daysPerWeek: formState.daysPerWeek,
      weeks: formState.weeks,
    };

    const buildSnapshotPayload = () => ({
      id: programId,
      name: formState.name,
      description: formState.description || null,
      notes: formState.notes || null,
      daysPerWeek: formState.daysPerWeek,
      weeks: formState.weeks,
      createdAt: new Date(),
      updatedAt: new Date(),
      workouts: workouts.map((w) => ({
        id: w.serverId ?? w.localId,
        dayIndex: w.dayIndex,
        name: w.name,
        orderIndex: w.orderIndex,
        exercises: w.exercises.map((ex, ei) => ({
          ...(() => {
            const saveReady = getSaveReadyExercise(ex);
            return {
              id: saveReady.localId,
              exerciseId: saveReady.exerciseId,
              name: saveReady.name,
              muscleGroup: saveReady.muscleGroup,
              libraryId: saveReady.libraryId ?? null,
              orderIndex: ei,
              exerciseType: saveReady.exerciseType,
              sets: saveReady.sets,
              reps: saveReady.reps,
              repsRaw: saveReady.repsRaw,
              weightMode: saveReady.weightMode,
              fixedWeight: saveReady.fixedWeight,
              percentageOfLift: saveReady.percentageOfLift,
              percentageLift: saveReady.percentageLift,
              addedWeight: saveReady.addedWeight,
              targetDuration: saveReady.targetDuration,
              targetDistance: saveReady.targetDistance,
              targetHeight: saveReady.targetHeight,
              isAmrap: saveReady.isAmrap,
              isAccessory: saveReady.isAccessory,
              isRequired: saveReady.isRequired,
              setNumber: saveReady.setNumber,
              progressionAmount: saveReady.progressionAmount,
              progressionInterval: saveReady.progressionInterval,
              progressionType: saveReady.progressionType,
            };
          })(),
        })),
      })),
    });

    try {
      const snapshot = buildSnapshotPayload();

      await tryOnlineOrEnqueue({
        apiCall: async () => {
          const savedProgram = await apiFetch<any>('/api/custom-programs', {
            method: 'POST',
            body: {
              ...programPayload,
              workouts: snapshot.workouts,
            },
          });
          const savedProgramId = savedProgram.id ?? programId;

          return { id: savedProgramId, name: formState.name };
        },
        userId,
        entityType: 'custom_program',
        operation: initialData?.id ? 'save_custom_program' : 'create_custom_program',
        entityId: programId,
        payload: snapshot,
        onEnqueue: async () => {
          await upsertLocalCustomProgramSnapshot(userId, snapshot, { createdLocally: true });
        },
      });

      await upsertLocalCustomProgramSnapshot(userId, snapshot, { createdLocally: false });
      onSaved?.({ id: programId, name: formState.name });
    } catch (e: any) {
      if (e instanceof OfflineError || e?.name === 'OfflineError') {
        setOfflineMessage("Saved locally. Will sync when you're back online.");
      } else {
        Alert.alert('Error', e?.message ?? 'Failed to save');
      }
    } finally {
      setIsSaving(false);
    }
  }, [validate, userId, initialData, formState, workouts, onSaved]);

  const deleteProgram = useCallback(async () => {
    if (!initialData?.id) return;
    if (!userId) {
      Alert.alert('Not authenticated', 'Please sign in to delete custom programs.');
      return;
    }

    setIsDeleting(true);
    setOfflineMessage(null);

    try {
      await tryOnlineOrEnqueue({
        apiCall: () =>
          apiFetch(`/api/custom-programs/${initialData.id}`, {
            method: 'DELETE',
          }),
        userId,
        entityType: 'custom_program',
        operation: 'delete_custom_program',
        entityId: initialData.id,
        payload: { id: initialData.id },
        onEnqueue: async () => {
          await deleteLocalCustomProgram(initialData.id);
        },
      });

      await deleteLocalCustomProgram(initialData.id);
      onDeleted?.(initialData.id);
    } catch (e: any) {
      if (e instanceof OfflineError || e?.name === 'OfflineError') {
        onDeleted?.(initialData.id);
      } else {
        Alert.alert('Error', e?.message ?? 'Failed to delete');
      }
    } finally {
      setIsDeleting(false);
    }
  }, [initialData?.id, onDeleted, userId]);

  const handleDelete = useCallback(() => {
    if (!initialData?.id) return;

    Alert.alert(
      'Delete Custom Program',
      `Delete ${formState.name || 'this custom program'}? This removes it from this device and your account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: deleteProgram,
        },
      ],
    );
  }, [deleteProgram, formState.name, initialData?.id]);

  return (
    <View style={styles.container}>
      <FormScrollView bottomInset={160} horizontalPadding={16} topPadding={insets.top + 16}>
        {/* Program Info */}
        <View style={styles.section}>
          <Text style={styles.label}>Program Name *</Text>
          <Input
            placeholder="Enter program name"
            value={formState.name}
            onChangeText={(text) => setFormState((prev) => ({ ...prev, name: text }))}
          />
          {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Description</Text>
          <Input
            placeholder="Enter description (optional)"
            value={formState.description}
            onChangeText={(text) => setFormState((prev) => ({ ...prev, description: text }))}
          />
        </View>

        {/* Structure */}
        <View style={styles.structureRow}>
          <View style={styles.structureField}>
            <Text style={styles.label}>Days / Week</Text>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => updateForm({ daysPerWeek: Math.max(1, formState.daysPerWeek - 1) })}
                style={styles.stepperBtn}
              >
                <Ionicons name="remove" size={16} color={colors.text} />
              </Pressable>
              <Text style={styles.stepperValue}>{formState.daysPerWeek}</Text>
              <Pressable
                onPress={() => updateForm({ daysPerWeek: Math.min(7, formState.daysPerWeek + 1) })}
                style={styles.stepperBtn}
              >
                <Ionicons name="add" size={16} color={colors.text} />
              </Pressable>
            </View>
          </View>
          <View style={styles.structureField}>
            <Text style={styles.label}>Weeks</Text>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => updateForm({ weeks: Math.max(1, formState.weeks - 1) })}
                style={styles.stepperBtn}
              >
                <Ionicons name="remove" size={16} color={colors.text} />
              </Pressable>
              <Text style={styles.stepperValue}>{formState.weeks}</Text>
              <Pressable
                onPress={() => updateForm({ weeks: Math.min(52, formState.weeks + 1) })}
                style={styles.stepperBtn}
              >
                <Ionicons name="add" size={16} color={colors.text} />
              </Pressable>
            </View>
          </View>
        </View>

        <Text style={styles.totalLabel}>
          {formState.daysPerWeek} days × {formState.weeks} weeks ={' '}
          {formState.daysPerWeek * formState.weeks} total sessions
        </Text>

        {/* Day Slots */}
        <Text style={styles.label}>Workouts</Text>
        {workouts.map((workout, wi) => (
          <Card key={`workout-${workout.localId}`} style={styles.workoutCard}>
            <View style={styles.workoutHeader}>
              <TextInput
                style={styles.workoutNameInput}
                value={workout.name}
                onChangeText={(text) => updateWorkout(wi, { name: text })}
                placeholder={`Day ${wi + 1}`}
              />
            </View>

            {workout.exercises.map((exercise, ei) => (
              <View key={`cpe-${exercise.localId}`} style={styles.exerciseCard}>
                <View style={styles.exerciseHeader}>
                  <View style={styles.exerciseInfo}>
                    <Text style={styles.exerciseName}>{exercise.name}</Text>
                    {exercise.muscleGroup && (
                      <Text style={styles.exerciseMuscle}>{exercise.muscleGroup}</Text>
                    )}
                  </View>
                  <View style={styles.exerciseActions}>
                    <Pressable
                      onPress={() => moveExercise(wi, ei, Math.max(0, ei - 1))}
                      disabled={ei === 0}
                      style={[styles.iconBtn, ei === 0 && styles.iconBtnDisabled]}
                    >
                      <Text style={styles.iconBtnText}>↑</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        moveExercise(wi, ei, Math.min(workout.exercises.length - 1, ei + 1))
                      }
                      disabled={ei === workout.exercises.length - 1}
                      style={[
                        styles.iconBtn,
                        ei === workout.exercises.length - 1 && styles.iconBtnDisabled,
                      ]}
                    >
                      <Text style={styles.iconBtnText}>↓</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => removeExerciseFromWorkout(wi, exercise.localId)}
                      style={styles.deleteIconBtn}
                    >
                      <Text style={styles.deleteIconText}>×</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Type chips */}
                <View style={styles.typeRow}>
                  {(['weights', 'bodyweight', 'timed', 'cardio', 'plyo'] as const).map((type) => {
                    const isSelected = exercise.exerciseType === type;
                    return (
                      <Pressable
                        key={`type-${exercise.localId}-${type}`}
                        onPress={() =>
                          updateExerciseInWorkout(
                            wi,
                            exercise.localId,
                            getExerciseTypeDefaults(type),
                          )
                        }
                        style={[
                          styles.typeChip,
                          isSelected ? styles.typeChipSelected : styles.typeChipDefault,
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeChipText,
                            isSelected ? styles.typeChipTextSelected : styles.typeChipTextDefault,
                          ]}
                        >
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Sets / Reps / Weight / Duration / Distance / Height */}
                <View style={styles.exerciseFieldsRow}>
                  {/* Sets — first position for weights, bodyweight, timed, fallback */}
                  {(exercise.exerciseType === 'weights' ||
                    exercise.exerciseType === 'bodyweight' ||
                    exercise.exerciseType === 'timed' ||
                    !exercise.exerciseType) && (
                    <NumericStepperField
                      label="Sets"
                      keyboardType="numeric"
                      value={exercise.sets ?? getDefaultSets(exercise.exerciseType)}
                      step={1}
                      min={1}
                      parseNumeric={(s) => {
                        const n = parseInt(s, 10);
                        return Number.isFinite(n) ? n : NaN;
                      }}
                      onChange={(n) => updateExerciseInWorkout(wi, exercise.localId, { sets: n })}
                    />
                  )}

                  {/* Reps (weights/bodyweight/plyo) */}
                  {(exercise.exerciseType === 'weights' ||
                    exercise.exerciseType === 'bodyweight' ||
                    exercise.exerciseType === 'plyo' ||
                    !exercise.exerciseType) && (
                    <NumericStepperField
                      label="Reps"
                      value={exercise.reps ?? getDefaultReps(exercise.exerciseType)}
                      step={1}
                      min={1}
                      onChange={(n) =>
                        updateExerciseInWorkout(wi, exercise.localId, {
                          reps: n,
                          repsRaw: String(n),
                        })
                      }
                    />
                  )}

                  {/* Weight mode toggle + Weight (weights/bodyweight) */}
                  {(exercise.exerciseType === 'weights' ||
                    exercise.exerciseType === 'bodyweight') && (
                    <>
                      {exercise.exerciseType === 'weights' && (
                        <View style={styles.modeRow}>
                          <Text style={styles.fieldLabel}>Mode</Text>
                          <View style={styles.modeToggleRow}>
                            {(['fixed', 'percentage', 'prompt_1rm', 'from_history'] as const).map(
                              (mode) => {
                                const isActive =
                                  mode === 'fixed'
                                    ? exercise.weightMode === 'fixed' || !exercise.weightMode
                                    : exercise.weightMode === mode;
                                return (
                                  <Pressable
                                    key={`mode-${exercise.localId}-${mode}`}
                                    onPress={() =>
                                      updateExerciseInWorkout(wi, exercise.localId, {
                                        weightMode:
                                          mode === 'fixed'
                                            ? exercise.weightMode === 'fixed'
                                              ? null
                                              : 'fixed'
                                            : mode,
                                        ...(mode === 'fixed'
                                          ? { fixedWeight: exercise.fixedWeight || 0 }
                                          : {}),
                                      })
                                    }
                                    style={[
                                      styles.modeChip,
                                      isActive ? styles.modeChipActive : styles.modeChipInactive,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.modeChipText,
                                        isActive
                                          ? styles.modeChipTextActive
                                          : styles.modeChipTextInactive,
                                      ]}
                                    >
                                      {mode === 'percentage'
                                        ? '1RM%'
                                        : mode === 'prompt_1rm'
                                          ? 'Ask Start'
                                          : mode === 'from_history'
                                            ? 'History'
                                            : 'Fixed'}
                                    </Text>
                                  </Pressable>
                                );
                              },
                            )}
                          </View>
                        </View>
                      )}

                      {(exercise.weightMode === 'percentage' ||
                        exercise.weightMode === 'prompt_1rm') && (
                        <>
                          <NumericStepperField
                            label="%"
                            keyboardType="numeric"
                            value={exercise.percentageOfLift ?? 75}
                            step={5}
                            min={1}
                            parseNumeric={(s) => {
                              const n = parseInt(s, 10);
                              return Number.isFinite(n) ? n : NaN;
                            }}
                            onChange={(n) =>
                              updateExerciseInWorkout(wi, exercise.localId, {
                                percentageOfLift: n,
                              })
                            }
                          />
                          {exercise.weightMode === 'percentage' && (
                            <View style={styles.exerciseField}>
                              <Text style={styles.fieldLabel}>Lift</Text>
                              <View style={styles.liftPickerRow}>
                                {(['squat', 'bench', 'deadlift', 'ohp'] as const).map(
                                  (lift, li) => (
                                    <Pressable
                                      key={`lift-${exercise.localId}-${li}`}
                                      onPress={() =>
                                        updateExerciseInWorkout(wi, exercise.localId, {
                                          percentageLift: lift,
                                        })
                                      }
                                      style={[
                                        styles.liftChip,
                                        exercise.percentageLift === lift
                                          ? styles.liftChipActive
                                          : styles.liftChipInactive,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.liftChipText,
                                          exercise.percentageLift === lift
                                            ? styles.liftChipTextActive
                                            : styles.liftChipTextInactive,
                                        ]}
                                      >
                                        {lift.charAt(0).toUpperCase()}
                                      </Text>
                                    </Pressable>
                                  ),
                                )}
                              </View>
                            </View>
                          )}
                        </>
                      )}

                      {exercise.weightMode === 'from_history' && (
                        <NumericStepperField
                          label={`Fallback (${weightUnit})`}
                          value={exercise.fixedWeight ?? 0}
                          step={weightUnit === 'lbs' ? 5 : 2.5}
                          min={0}
                          onChange={(n) =>
                            updateExerciseInWorkout(wi, exercise.localId, { fixedWeight: n })
                          }
                        />
                      )}

                      {(exercise.weightMode === 'fixed' || !exercise.weightMode) && (
                        <NumericStepperField
                          label={`${exercise.exerciseType === 'bodyweight' ? 'Added' : 'Weight'} (${weightUnit})`}
                          value={exercise.fixedWeight ?? 0}
                          step={weightUnit === 'lbs' ? 5 : 2.5}
                          min={0}
                          onChange={(n) =>
                            updateExerciseInWorkout(wi, exercise.localId, { fixedWeight: n })
                          }
                        />
                      )}
                    </>
                  )}

                  {/* Duration for timed/cardio */}
                  {(exercise.exerciseType === 'timed' || exercise.exerciseType === 'cardio') && (
                    <NumericStepperField
                      label="Duration (s)"
                      value={exercise.targetDuration ?? 60}
                      step={5}
                      min={0}
                      onChange={(n) =>
                        updateExerciseInWorkout(wi, exercise.localId, { targetDuration: n })
                      }
                    />
                  )}

                  {/* Distance for cardio */}
                  {exercise.exerciseType === 'cardio' && (
                    <NumericStepperField
                      label="Distance (m)"
                      value={exercise.targetDistance ?? 400}
                      step={100}
                      min={0}
                      onChange={(n) =>
                        updateExerciseInWorkout(wi, exercise.localId, { targetDistance: n })
                      }
                    />
                  )}

                  {/* Height for plyo */}
                  {exercise.exerciseType === 'plyo' && (
                    <NumericStepperField
                      label={`Height (${heightUnit})`}
                      value={+toDisplayHeight(exercise.targetHeight ?? 60, heightUnit).toFixed(1)}
                      step={heightUnit === 'cm' ? 5 : 2}
                      min={0}
                      onChange={(n) =>
                        updateExerciseInWorkout(wi, exercise.localId, {
                          targetHeight: toStorageHeight(n, heightUnit),
                        })
                      }
                    />
                  )}

                  {/* Sets — last position for plyo, cardio */}
                  {(exercise.exerciseType === 'plyo' || exercise.exerciseType === 'cardio') && (
                    <NumericStepperField
                      label="Sets"
                      keyboardType="numeric"
                      value={exercise.sets ?? getDefaultSets(exercise.exerciseType)}
                      step={1}
                      min={1}
                      parseNumeric={(s) => {
                        const n = parseInt(s, 10);
                        return Number.isFinite(n) ? n : NaN;
                      }}
                      onChange={(n) => updateExerciseInWorkout(wi, exercise.localId, { sets: n })}
                    />
                  )}
                </View>

                {/* Progression */}
                <View style={styles.progressionRow}>
                  <Text style={styles.fieldLabel}>Progression</Text>
                  <View style={styles.progressionTypeRow}>
                    <Pressable
                      onPress={() =>
                        updateExerciseInWorkout(wi, exercise.localId, {
                          progressionType: 'fixed',
                        })
                      }
                      style={[
                        styles.modeChip,
                        exercise.progressionType === 'fixed'
                          ? styles.modeChipActive
                          : styles.modeChipInactive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeChipText,
                          exercise.progressionType === 'fixed'
                            ? styles.modeChipTextActive
                            : styles.modeChipTextInactive,
                        ]}
                      >
                        Fixed
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        updateExerciseInWorkout(wi, exercise.localId, {
                          progressionType: 'percentage',
                        })
                      }
                      style={[
                        styles.modeChip,
                        exercise.progressionType === 'percentage'
                          ? styles.modeChipActive
                          : styles.modeChipInactive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeChipText,
                          exercise.progressionType === 'percentage'
                            ? styles.modeChipTextActive
                            : styles.modeChipTextInactive,
                        ]}
                      >
                        %
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.progressionControls}>
                    <EditorTextInput
                      style={styles.progressionInput}
                      keyboardType="numeric"
                      value={exercise.progressionAmount ?? 0}
                      parseNumeric={(s) => {
                        const n = parseFloat(s);
                        return isNaN(n) ? 0 : n;
                      }}
                      onChange={(n) =>
                        updateExerciseInWorkout(wi, exercise.localId, { progressionAmount: n })
                      }
                    />
                    <Text style={styles.progressionUnit}>
                      {exercise.progressionType === 'percentage'
                        ? '%'
                        : exercise.exerciseType === 'weights'
                          ? weightUnit
                          : exercise.exerciseType === 'bodyweight'
                            ? 'reps'
                            : exercise.exerciseType === 'timed'
                              ? 'sec'
                              : exercise.exerciseType === 'cardio'
                                ? 'm'
                                : exercise.exerciseType === 'plyo'
                                  ? heightUnit
                                  : ''}
                    </Text>
                    <Text style={styles.progressionLabel}>every</Text>
                    <EditorTextInput
                      style={styles.progressionInput}
                      keyboardType="numeric"
                      value={exercise.progressionInterval ?? 1}
                      parseNumeric={(s) => {
                        const n = parseInt(s, 10);
                        return isNaN(n) ? 1 : n;
                      }}
                      onChange={(n) =>
                        updateExerciseInWorkout(wi, exercise.localId, { progressionInterval: n })
                      }
                    />
                    <Text style={styles.progressionUnit}>
                      {(exercise.progressionInterval ?? 1) === 1 ? 'week' : 'weeks'}
                    </Text>
                  </View>
                </View>

                {/* Toggle row: AMRAP, Accessory, Optional */}
                <View style={styles.toggleRow}>
                  <Pressable
                    onPress={() => {
                      if (exercise.isAmrap) {
                        updateExerciseInWorkout(wi, exercise.localId, { isAmrap: false });
                        return;
                      }
                      promptForAmrapSplit(wi, exercise);
                    }}
                    style={[
                      styles.toggleBtn,
                      exercise.isAmrap ? styles.toggleBtnActive : styles.toggleBtnDefault,
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
                      updateExerciseInWorkout(wi, exercise.localId, {
                        isAccessory: !exercise.isAccessory,
                      })
                    }
                    style={[
                      styles.toggleBtn,
                      exercise.isAccessory ? styles.toggleBtnActive : styles.toggleBtnDefault,
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
                      updateExerciseInWorkout(wi, exercise.localId, {
                        isRequired: !exercise.isRequired,
                      })
                    }
                    style={[
                      styles.toggleBtn,
                      !exercise.isRequired ? styles.toggleBtnActive : styles.toggleBtnDefault,
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
              </View>
            ))}

            <Pressable
              style={styles.addExerciseBtn}
              onPress={() => {
                setActiveWorkoutIndex(wi);
                setShowExerciseSearch(true);
              }}
            >
              <Text style={styles.addExerciseBtnText}>+ Add Exercise</Text>
            </Pressable>
          </Card>
        ))}

        {initialData?.id ? (
          <View style={styles.deleteSection}>
            <Pressable
              testID="custom-program-delete"
              accessibilityLabel="custom-program-delete"
              style={[styles.deleteProgramButton, isDeleting && styles.deleteProgramButtonDisabled]}
              onPress={handleDelete}
              disabled={isDeleting || isSaving}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                  <Text style={styles.deleteProgramText}>Delete Program</Text>
                </>
              )}
            </Pressable>
          </View>
        ) : null}
      </FormScrollView>

      {offlineMessage && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>{offlineMessage}</Text>
        </View>
      )}

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.footerButton}>
          <Button variant="outline" size="lg" onPress={onClose} fullWidth>
            <Text style={styles.cancelText}>Cancel</Text>
          </Button>
        </View>
        <View style={styles.footerButton}>
          <Button size="lg" onPress={handleSave} disabled={isSaving || isDeleting} fullWidth>
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Text style={styles.saveText}>{initialData ? 'Save Changes' : 'Create Program'}</Text>
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
          onSelect={(exercises) => {
            if (activeWorkoutIndex !== null) {
              addExerciseToWorkout(activeWorkoutIndex, exercises);
            }
            setShowExerciseSearch(false);
          }}
          onClose={() => setShowExerciseSearch(false)}
        />
      </Modal>
    </View>
  );
}

function EditorTextInput({
  value,
  onChange,
  parseNumeric,
  keyboardType,
  style,
}: {
  value: number;
  onChange: (n: number) => void;
  parseNumeric: (s: string) => number;
  keyboardType?: 'numeric' | 'decimal-pad';
  style?: any;
}) {
  const [local, setLocal] = useState(String(value));
  const containerRef = useRef<View>(null);
  const scrollToInput = useScrollToInput();

  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  return (
    <View ref={containerRef} collapsable={false} style={{ flex: 1 }}>
      <TextInput
        style={style}
        keyboardType={keyboardType ?? 'numeric'}
        selectTextOnFocus
        value={local}
        onChangeText={(t) => {
          setLocal(t);
          if (t.trim() === '' || t === '.') return;
          const parsed = parseNumeric(t);
          if (Number.isFinite(parsed)) {
            onChange(parsed);
          }
        }}
        onFocus={() => requestAnimationFrame(() => scrollToInput(containerRef))}
        onBlur={() => {
          const parsed = parseNumeric(local);
          if (Number.isFinite(parsed)) {
            onChange(parsed);
          } else {
            setLocal(String(value));
          }
        }}
      />
    </View>
  );
}

function NumericStepperField({
  label,
  value,
  onChange,
  step,
  min = 0,
  keyboardType = 'decimal-pad',
  parseNumeric,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step: number;
  min?: number;
  keyboardType?: 'numeric' | 'decimal-pad';
  parseNumeric?: (s: string) => number;
}) {
  const parser =
    parseNumeric ??
    ((s: string) => {
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : NaN;
    });
  const nextValue = (delta: number) => Math.max(min, +(value + delta).toFixed(2));

  return (
    <View style={styles.exerciseField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.counterContainer}>
        <Pressable onPress={() => onChange(nextValue(-step))} style={styles.counterBtn}>
          <Text style={styles.counterBtnText}>-</Text>
        </Pressable>
        <EditorTextInput
          style={styles.counterInput}
          keyboardType={keyboardType}
          value={value}
          parseNumeric={parser}
          onChange={onChange}
        />
        <Pressable onPress={() => onChange(nextValue(step))} style={styles.counterBtn}>
          <Text style={styles.counterBtnText}>+</Text>
        </Pressable>
      </View>
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
  totalLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  structureRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  structureField: {
    flex: 1,
  },
  stepperRow: {
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
  stepperBtn: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  stepperValue: {
    flex: 1,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  workoutCard: {
    marginBottom: 16,
    padding: 16,
  },
  workoutHeader: {
    marginBottom: 12,
  },
  workoutNameInput: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 6,
  },
  exerciseCard: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    marginTop: 12,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: typography.fontSizes.sm,
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
  iconBtn: {
    height: 28,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: colors.border,
  },
  iconBtnDisabled: {
    opacity: 0.3,
  },
  iconBtnText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
  },
  deleteIconBtn: {
    marginLeft: 4,
    height: 28,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  deleteIconText: {
    fontSize: typography.fontSizes.sm,
    color: colors.error,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
  },
  typeChip: {
    borderRadius: 9999,
    paddingHorizontal: 6,
    paddingVertical: 4,
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
  exerciseFieldsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  exerciseField: {
    flex: 1,
    minWidth: 100,
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
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 90,
  },
  counterBtn: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBtnText: {
    fontSize: typography.fontSizes.base,
    color: colors.textMuted,
  },
  counterInput: {
    flex: 1,
    minWidth: 36,
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: 2,
    paddingVertical: 0,
  },
  modeRow: {
    width: '100%',
    marginBottom: 8,
  },
  modeToggleRow: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  modeChip: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  modeChipActive: {
    backgroundColor: colors.accent,
  },
  modeChipInactive: {
    backgroundColor: colors.background,
  },
  modeChipText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
  },
  modeChipTextActive: {
    color: colors.text,
  },
  modeChipTextInactive: {
    color: colors.textMuted,
  },
  liftPickerRow: {
    flexDirection: 'row',
    gap: 4,
  },
  liftChip: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  liftChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  liftChipInactive: {
    backgroundColor: colors.background,
  },
  liftChipText: {
    fontSize: typography.fontSizes.xs,
  },
  liftChipTextActive: {
    color: colors.text,
  },
  liftChipTextInactive: {
    color: colors.textMuted,
  },
  progressionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  progressionTypeRow: {
    flexDirection: 'row',
    gap: 4,
  },
  progressionControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  progressionInput: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    textAlign: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingVertical: 4,
    paddingHorizontal: 8,
    width: 44,
  },
  progressionUnit: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
  },
  progressionLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
    marginHorizontal: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  toggleBtnActive: {
    backgroundColor: colors.border,
  },
  toggleBtnDefault: {
    backgroundColor: 'transparent',
  },
  toggleCheckbox: {
    width: 14,
    height: 14,
    borderRadius: 3,
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
  addExerciseBtn: {
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    paddingVertical: 10,
    alignItems: 'center',
  },
  addExerciseBtnText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    fontWeight: typography.fontWeights.medium,
  },
  deleteSection: {
    marginTop: 8,
    marginBottom: 24,
  },
  deleteProgramButton: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: statusBg.errorBorder,
    backgroundColor: statusBg.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  deleteProgramButtonDisabled: {
    opacity: 0.6,
  },
  deleteProgramText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.error,
  },
  offlineBanner: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: statusBg.errorBorder,
    backgroundColor: statusBg.error,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  offlineBannerText: {
    fontSize: typography.fontSizes.sm,
    color: colors.error,
  },
  footer: {
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
  cancelText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  saveText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
});
