import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { apiFetch } from '@/lib/api';
import { ExerciseSearch } from '@/components/workout/ExerciseSearch';
import type { ExerciseLibraryItem } from '@/context/WorkoutSessionContext';
import {
  getDefaultExerciseTargets,
  getDefaultProgressionIncrement,
  getProgressionLabels,
  getProgressionType,
} from '@/lib/exerciseProgression';
import { colors, layout, radius, spacing, typography } from '@/theme';

const LBS_TO_KG = 0.453592;
const KG_TO_LBS = 2.20462;

type ProgressionMode = 'session' | 'week';

type BuilderExercise = {
  id: string;
  exerciseId: string;
  libraryId: string | null;
  name: string;
  muscleGroup: string | null;
  exerciseType: string | null;
  sets: string;
  reps: string;
  startingWeight: string;
  incrementWeight: string;
  targetDuration: string;
  targetDistance: string;
  targetHeight: string;
  progressionMode: ProgressionMode;
  isAmrap: boolean;
};

type BuilderDay = {
  name: string;
  exercises: BuilderExercise[];
};

export type CustomProgramDetail = {
  id: string;
  name: string;
  description: string | null;
  weeks: number;
  daysPerWeek: number;
  requiresOneRm?: boolean;
  days: Array<{
    name: string;
    exercises: Array<{
      exerciseId: string;
      sets: number;
      reps: number | null;
      startingWeight: number | null;
      incrementWeight: number;
      targetDuration?: number | null;
      targetDistance?: number | null;
      targetHeight?: number | null;
      progressionMode: ProgressionMode;
      isAmrap: boolean;
      exercise: {
        id: string;
        name: string;
        muscleGroup: string | null;
        libraryId: string | null;
        exerciseType?: string | null;
      };
    }>;
  }>;
};

interface CustomProgramBuilderProps {
  visible: boolean;
  weightUnit: 'kg' | 'lbs';
  initialProgram?: CustomProgramDetail | null;
  onClose: () => void;
  onSaved: () => void;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toDisplayWeight(value: number | null | undefined, weightUnit: 'kg' | 'lbs') {
  if (typeof value !== 'number') return '';
  const display = weightUnit === 'lbs' ? value * KG_TO_LBS : value;
  return Number(display.toFixed(1)).toString();
}

function toKg(value: string, weightUnit: 'kg' | 'lbs') {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return weightUnit === 'lbs' ? parsed * LBS_TO_KG : parsed;
}

function parseProgressionValue(
  value: string,
  exerciseType: string | null | undefined,
  weightUnit: 'kg' | 'lbs',
) {
  if (getProgressionType(exerciseType) === 'weight') return toKg(value, weightUnit);
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseOptionalNumber(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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

function createEmptyDays(daysPerWeek: number): BuilderDay[] {
  return Array.from({ length: daysPerWeek }, (_, index) => ({
    name: `Day ${index + 1}`,
    exercises: [],
  }));
}

function buildInitialDays(
  initialProgram: CustomProgramDetail | null | undefined,
  weightUnit: 'kg' | 'lbs',
) {
  if (!initialProgram) return createEmptyDays(3);
  return initialProgram.days.map((day) => ({
    name: day.name,
    exercises: day.exercises.map((exercise) => ({
      id: uid(),
      exerciseId: exercise.exerciseId,
      libraryId: exercise.exercise.libraryId,
      name: exercise.exercise.name,
      muscleGroup: exercise.exercise.muscleGroup,
      exerciseType: exercise.exercise.exerciseType ?? null,
      sets: String(exercise.sets),
      reps: exercise.reps == null ? '' : String(exercise.reps),
      startingWeight:
        getProgressionType(exercise.exercise.exerciseType) === 'weight'
          ? toDisplayWeight(exercise.startingWeight, weightUnit)
          : (exercise.startingWeight ?? '').toString(),
      incrementWeight:
        getProgressionType(exercise.exercise.exerciseType) === 'weight'
          ? toDisplayWeight(exercise.incrementWeight, weightUnit)
          : exercise.incrementWeight.toString(),
      targetDuration: exercise.targetDuration == null ? '' : String(exercise.targetDuration),
      targetDistance: exercise.targetDistance == null ? '' : String(exercise.targetDistance),
      targetHeight: exercise.targetHeight == null ? '' : String(exercise.targetHeight),
      progressionMode: exercise.progressionMode ?? 'session',
      isAmrap: Boolean(exercise.isAmrap),
    })),
  }));
}

export function CustomProgramBuilder({
  visible,
  weightUnit,
  initialProgram,
  onClose,
  onSaved,
}: CustomProgramBuilderProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weeks, setWeeks] = useState('8');
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [requiresOneRm, setRequiresOneRm] = useState(true);
  const [days, setDays] = useState<BuilderDay[]>(() => createEmptyDays(3));
  const [selectingDayIndex, setSelectingDayIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(initialProgram?.name ?? '');
    setDescription(initialProgram?.description ?? '');
    setWeeks(String(initialProgram?.weeks ?? 8));
    setDaysPerWeek(initialProgram?.daysPerWeek ?? 3);
    setRequiresOneRm(initialProgram?.requiresOneRm ?? true);
    setDays(buildInitialDays(initialProgram, weightUnit));
  }, [initialProgram, visible, weightUnit]);

  const totalSessions = useMemo(() => {
    const parsedWeeks = Number.parseInt(weeks, 10);
    return Number.isFinite(parsedWeeks) ? parsedWeeks * daysPerWeek : 0;
  }, [weeks, daysPerWeek]);

  function setDayCount(nextCount: number) {
    setDaysPerWeek(nextCount);
    setDays((prev) => {
      if (nextCount > prev.length) {
        return [
          ...prev,
          ...createEmptyDays(nextCount - prev.length).map((day, i) => ({
            ...day,
            name: `Day ${prev.length + i + 1}`,
          })),
        ];
      }
      return prev.slice(0, nextCount);
    });
  }

  function updateExercise(dayIndex: number, exerciseId: string, updates: Partial<BuilderExercise>) {
    setDays((prev) =>
      prev.map((day, index) =>
        index === dayIndex
          ? {
              ...day,
              exercises: day.exercises.map((exercise) =>
                exercise.id === exerciseId ? { ...exercise, ...updates } : exercise,
              ),
            }
          : day,
      ),
    );
  }

  function removeExercise(dayIndex: number, exerciseId: string) {
    setDays((prev) =>
      prev.map((day, index) =>
        index === dayIndex
          ? { ...day, exercises: day.exercises.filter((exercise) => exercise.id !== exerciseId) }
          : day,
      ),
    );
  }

  async function handleSelectExercises(exercises: ExerciseLibraryItem[]) {
    if (selectingDayIndex == null) return;
    const builderExercises: BuilderExercise[] = [];
    for (const exercise of exercises) {
      const targets = getDefaultExerciseTargets(exercise.exerciseType);
      const amrapMode = isAmrapExercise(exercise) ? await chooseAmrapMode() : null;
      if (amrapMode === 'skip') continue;
      builderExercises.push({
        id: uid(),
        exerciseId: exercise.id,
        libraryId: exercise.libraryId ?? null,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup ?? null,
        exerciseType: exercise.exerciseType ?? null,
        sets: amrapMode === 'only' ? '1' : targets.sets,
        reps: amrapMode === null ? targets.reps : '',
        startingWeight:
          getProgressionType(exercise.exerciseType) === 'time' ? targets.duration : targets.weight,
        incrementWeight: getDefaultProgressionIncrement(exercise.exerciseType, weightUnit),
        targetDuration: targets.duration,
        targetDistance: targets.distance,
        targetHeight: targets.height,
        progressionMode: 'session',
        isAmrap: amrapMode !== null,
      });
    }
    if (builderExercises.length === 0) return;
    setDays((prev) =>
      prev.map((day, index) =>
        index === selectingDayIndex
          ? {
              ...day,
              exercises: [...day.exercises, ...builderExercises],
            }
          : day,
      ),
    );
  }

  async function handleSave() {
    const parsedWeeks = Number.parseInt(weeks, 10);
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Enter a name for this custom program.');
      return;
    }
    if (!Number.isInteger(parsedWeeks) || parsedWeeks < 1 || parsedWeeks > 52) {
      Alert.alert('Invalid Weeks', 'Weeks must be between 1 and 52.');
      return;
    }
    if (days.some((day) => day.exercises.length === 0)) {
      Alert.alert('Missing Exercises', 'Each day needs at least one exercise.');
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      weeks: parsedWeeks,
      daysPerWeek,
      requiresOneRm,
      days: days.map((day) => ({
        name: day.name.trim() || 'Day',
        exercises: day.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          sets: Number.parseInt(exercise.sets, 10),
          reps: exercise.isAmrap ? null : Number.parseInt(exercise.reps, 10),
          startingWeight: parseProgressionValue(
            exercise.startingWeight,
            exercise.exerciseType,
            weightUnit,
          ),
          incrementWeight:
            parseProgressionValue(exercise.incrementWeight, exercise.exerciseType, weightUnit) ?? 0,
          targetDuration: parseOptionalNumber(exercise.targetDuration),
          targetDistance: parseOptionalNumber(exercise.targetDistance),
          targetHeight: parseOptionalNumber(exercise.targetHeight),
          progressionMode: exercise.progressionMode,
          isAmrap: exercise.isAmrap,
        })),
      })),
    };

    setSaving(true);
    try {
      await apiFetch(
        initialProgram ? `/api/programs/custom/${initialProgram.id}` : '/api/programs/custom',
        {
          method: initialProgram ? 'PUT' : 'POST',
          body: payload,
        },
      );
      onSaved();
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to save custom program',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Pressable onPress={onClose} style={styles.iconButton}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>
            {initialProgram ? 'Edit Custom Program' : 'Create Custom Program'}
          </Text>
        </View>
        <ScrollView
          style={styles.container}
          contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Hypertrophy Block"
              placeholderTextColor={colors.placeholderText}
              style={styles.input}
            />
            <Text style={styles.label}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Optional"
              placeholderTextColor={colors.placeholderText}
              style={[styles.input, styles.multiline]}
              multiline
            />
            <View style={styles.row}>
              <View style={styles.flex1}>
                <Text style={styles.label}>Weeks</Text>
                <TextInput
                  value={weeks}
                  onChangeText={(value) => setWeeks(value.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.label}>Days / Week</Text>
                <View style={styles.segmentRow}>
                  {[1, 2, 3, 4, 5, 6].map((count) => (
                    <Pressable
                      key={`days:${count}`}
                      style={[styles.segment, daysPerWeek === count && styles.segmentActive]}
                      onPress={() => setDayCount(count)}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          daysPerWeek === count && styles.segmentTextActive,
                        ]}
                      >
                        {count}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            <Pressable style={styles.toggleRow} onPress={() => setRequiresOneRm((value) => !value)}>
              <View style={[styles.checkbox, requiresOneRm && styles.checkboxActive]}>
                {requiresOneRm ? <Ionicons name="checkmark" size={16} color={colors.text} /> : null}
              </View>
              <View style={styles.flex1}>
                <Text style={styles.toggleTitle}>Prompt for 1RM on start</Text>
                <Text style={styles.toggleDescription}>
                  Stores starting lift values so the end-of-program 1RM test can compare progress.
                </Text>
              </View>
            </Pressable>
          </View>

          <View style={styles.reviewBar}>
            <Text style={styles.reviewText}>{totalSessions} sessions</Text>
            <Text style={styles.reviewSubtext}>Weights shown in {weightUnit}</Text>
          </View>

          {days.map((day, dayIndex) => (
            <View key={`day:${dayIndex}`} style={styles.daySection}>
              <TextInput
                value={day.name}
                onChangeText={(value) =>
                  setDays((prev) =>
                    prev.map((item, index) =>
                      index === dayIndex ? { ...item, name: value } : item,
                    ),
                  )
                }
                style={styles.dayTitleInput}
              />
              {day.exercises.map((exercise) => {
                const progressionLabels = getProgressionLabels(exercise.exerciseType, weightUnit);
                return (
                  <View key={`custom-program-exercise:${exercise.id}`} style={styles.exerciseRow}>
                    <View style={styles.exerciseHeader}>
                      <View style={styles.flex1}>
                        <Text style={styles.exerciseName}>{exercise.name}</Text>
                        <Text style={styles.exerciseMeta}>
                          {exercise.muscleGroup ?? 'Exercise'}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => removeExercise(dayIndex, exercise.id)}
                        style={styles.iconButton}
                      >
                        <Ionicons name="trash-outline" size={20} color={colors.error} />
                      </Pressable>
                    </View>
                    <View style={styles.grid}>
                      <Field
                        label="Sets"
                        value={exercise.sets}
                        onChangeText={(value) =>
                          updateExercise(dayIndex, exercise.id, {
                            sets: value.replace(/[^0-9]/g, ''),
                          })
                        }
                      />
                      {exercise.exerciseType !== 'timed' && exercise.exerciseType !== 'cardio' && (
                        <Field
                          label="Reps"
                          value={exercise.reps}
                          editable={!exercise.isAmrap}
                          onChangeText={(value) =>
                            updateExercise(dayIndex, exercise.id, {
                              reps: value.replace(/[^0-9]/g, ''),
                            })
                          }
                        />
                      )}
                      {getProgressionType(exercise.exerciseType) !== 'reps' && (
                        <Field
                          label={
                            getProgressionType(exercise.exerciseType) === 'time'
                              ? 'Duration (sec)'
                              : progressionLabels.start
                          }
                          value={exercise.startingWeight}
                          onChangeText={(value) =>
                            updateExercise(dayIndex, exercise.id, {
                              startingWeight: value.replace(/[^0-9.]/g, ''),
                            })
                          }
                        />
                      )}
                      <Field
                        label={progressionLabels.increment}
                        value={exercise.incrementWeight}
                        onChangeText={(value) =>
                          updateExercise(dayIndex, exercise.id, {
                            incrementWeight: value.replace(/[^0-9.]/g, ''),
                          })
                        }
                      />
                      {exercise.exerciseType === 'cardio' && (
                        <Field
                          label="Distance (m)"
                          value={exercise.targetDistance}
                          onChangeText={(value) =>
                            updateExercise(dayIndex, exercise.id, {
                              targetDistance: value.replace(/[^0-9.]/g, ''),
                            })
                          }
                        />
                      )}
                      {exercise.exerciseType === 'plyo' && (
                        <Field
                          label="Height (cm)"
                          value={exercise.targetHeight}
                          onChangeText={(value) =>
                            updateExercise(dayIndex, exercise.id, {
                              targetHeight: value.replace(/[^0-9.]/g, ''),
                            })
                          }
                        />
                      )}
                    </View>
                    <View style={styles.optionRow}>
                      <Pressable
                        style={[
                          styles.optionChip,
                          exercise.progressionMode === 'session' && styles.optionChipActive,
                        ]}
                        onPress={() =>
                          updateExercise(dayIndex, exercise.id, { progressionMode: 'session' })
                        }
                      >
                        <Text style={styles.optionText}>Per Session</Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.optionChip,
                          exercise.progressionMode === 'week' && styles.optionChipActive,
                        ]}
                        onPress={() =>
                          updateExercise(dayIndex, exercise.id, { progressionMode: 'week' })
                        }
                      >
                        <Text style={styles.optionText}>Per Week</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.optionChip, exercise.isAmrap && styles.optionChipActive]}
                        onPress={() => {
                          if (exercise.isAmrap) {
                            updateExercise(dayIndex, exercise.id, { isAmrap: false, reps: '8' });
                            return;
                          }
                          Alert.alert('AMRAP sets', 'How should this exercise be added?', [
                            {
                              text: 'AMRAP only',
                              onPress: () =>
                                updateExercise(dayIndex, exercise.id, {
                                  isAmrap: true,
                                  sets: '1',
                                  reps: '',
                                }),
                            },
                            {
                              text: 'Working sets + AMRAP',
                              onPress: () =>
                                updateExercise(dayIndex, exercise.id, {
                                  isAmrap: true,
                                  sets: String(
                                    Math.max(2, Number.parseInt(exercise.sets, 10) || 3),
                                  ),
                                  reps: '',
                                }),
                            },
                            { text: 'Cancel', style: 'cancel' },
                          ]);
                        }}
                      >
                        <Text style={styles.optionText}>AMRAP</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
              <Pressable style={styles.addButton} onPress={() => setSelectingDayIndex(dayIndex)}>
                <Ionicons name="add" size={18} color={colors.text} />
                <Text style={styles.addButtonText}>Add Exercise</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable
            style={[styles.saveButton, saving && styles.disabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator size="small" color={colors.text} /> : null}
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving...' : 'Save Custom Program'}
            </Text>
          </Pressable>
        </View>

        <Modal visible={selectingDayIndex !== null} animationType="slide">
          <ExerciseSearch
            visible={selectingDayIndex !== null}
            onSelect={handleSelectExercises}
            onClose={() => setSelectingDayIndex(null)}
          />
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  value,
  editable = true,
  onChangeText,
}: {
  label: string;
  value: string;
  editable?: boolean;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        editable={editable}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder={editable ? '0' : 'AMRAP'}
        placeholderTextColor={colors.placeholderText}
        style={[styles.fieldInput, !editable && styles.disabledInput]}
      />
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
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
  iconButton: {
    padding: spacing.xs,
  },
  section: {
    padding: layout.screenPadding,
    gap: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    textTransform: 'uppercase',
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: typography.fontSizes.base,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  segment: {
    minWidth: 34,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  segmentActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  segmentText: {
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: colors.text,
    fontWeight: typography.fontWeights.semibold,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  toggleTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  toggleDescription: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  reviewBar: {
    marginHorizontal: layout.screenPadding,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  reviewText: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
  },
  reviewSubtext: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    marginTop: spacing.xs,
  },
  daySection: {
    paddingHorizontal: layout.screenPadding,
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  dayTitleInput: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
  },
  exerciseRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  exerciseName: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
  },
  exerciseMeta: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    marginTop: spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  field: {
    width: '48%',
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
  },
  fieldInput: {
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  disabledInput: {
    opacity: 0.6,
  },
  optionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  optionChip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionChipActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(239,111,79,0.16)',
  },
  optionText: {
    color: colors.text,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  addButtonText: {
    color: colors.text,
    fontWeight: typography.fontWeights.medium,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  saveButton: {
    minHeight: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  disabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
  },
});
