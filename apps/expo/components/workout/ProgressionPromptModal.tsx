import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Surface } from '@/components/ui/app-primitives';
import {
  applyProgressionToHistorySet,
  getDefaultProgressionForExercise,
  getLastWorkoutSummary,
  getSuggestedSummary,
  hasWeightInSets,
  type ProgressionDefaults,
  type ProgressionMode,
  type ProgressionSelection,
  type WeightUnit,
} from '@/lib/workout-progression';
import { accent, border, colors, layout, radius, spacing, text, typography } from '@/theme';

export type ProgressionExercisePreview = {
  exerciseId: string;
  libraryId?: string | null;
  name: string;
  exerciseType: string;
  isAmrap: boolean;
  lastWorkoutDate: string | null;
  sets: Array<{
    setNumber: number;
    weight: number | null;
    reps: number | null;
    rpe: number | null;
    duration: number | null;
    distance: number | null;
    height: number | null;
  }>;
};

type ExerciseState = {
  mode: ProgressionMode;
  customValue: string;
  increment: number; // resolved per-exercise default increment
};

type ProgressionDefaultValues = {
  defaultWeightIncrement: number;
  defaultBodyweightIncrement: number;
  defaultCardioIncrement: number;
  defaultTimedIncrement: number;
  defaultPlyoIncrement: number;
};
type ProgressionDefaultKey = keyof ProgressionDefaultValues;

type ProgressionDefaultConfig = {
  key: ProgressionDefaultKey;
  label: string;
  step: number;
  isVisible: (exercises: ProgressionExercisePreview[]) => boolean;
  format: (value: number, weightUnit: WeightUnit) => string;
};

type ProgressionPromptModalProps = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  weightUnit: WeightUnit;
  defaultIncrement: number;
  templateDefaults?: ProgressionDefaults;
  exercises: ProgressionExercisePreview[];
  allowPerExerciseEdit: boolean;
  onConfirm: (selections: ProgressionSelection[]) => void;
  onSkipHistory: () => void;
  onClose: () => void;
};

function formatDate(date: string | null) {
  if (!date) return 'Last workout';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'Last workout';
  return `Last ${parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

function formatSetValue(set: ProgressionExercisePreview['sets'][number], weightUnit: WeightUnit) {
  const parts: string[] = [];
  if (set.weight !== null && set.weight > 0) parts.push(`${set.weight} ${weightUnit}`);
  if (set.reps !== null) parts.push(`${set.reps} reps`);
  if (set.duration !== null && set.duration > 0) {
    const mins = Math.floor(set.duration / 60);
    const secs = set.duration % 60;
    if (mins > 0 && secs > 0) parts.push(`${mins}:${secs.toString().padStart(2, '0')}`);
    else if (mins > 0) parts.push(`${mins}:00`);
    else parts.push(`${secs} sec`);
  }
  if (set.distance !== null && set.distance > 0) {
    if (set.distance >= 1000) parts.push(`${(set.distance / 1000).toFixed(1)} km`);
    else parts.push(`${set.distance} m`);
  }
  if (set.height !== null && set.height > 0) parts.push(`${set.height} cm`);
  return parts.length > 0 ? parts.join(' × ') : 'No target';
}

function parseIncrement(value: string) {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSecondsIncrement(value: number) {
  const mins = Math.floor(value / 60);
  const secs = value % 60;
  if (mins > 0 && secs > 0) return `+${mins}:${secs.toString().padStart(2, '0')} min`;
  if (mins > 0) return `+${mins}:00 min`;
  return `+${secs} sec`;
}

function resolvePositiveIncrement(value: number | null | undefined, fallback: number) {
  return typeof value === 'number' && !Number.isNaN(value) && value > 0 ? value : fallback;
}

function resolveProgressionDefaults(
  weightUnit: WeightUnit,
  defaultIncrement: number,
  templateDefaults?: ProgressionDefaults,
): ProgressionDefaultValues {
  return {
    defaultWeightIncrement: resolvePositiveIncrement(
      templateDefaults?.defaultWeightIncrement,
      defaultIncrement,
    ),
    defaultBodyweightIncrement: resolvePositiveIncrement(
      templateDefaults?.defaultBodyweightIncrement,
      2,
    ),
    defaultCardioIncrement: resolvePositiveIncrement(templateDefaults?.defaultCardioIncrement, 60),
    defaultTimedIncrement: resolvePositiveIncrement(templateDefaults?.defaultTimedIncrement, 5),
    defaultPlyoIncrement: resolvePositiveIncrement(templateDefaults?.defaultPlyoIncrement, 1),
  };
}

function getDefaultKeyForExercise(
  exercise: ProgressionExercisePreview,
  hasWeight: boolean,
): ProgressionDefaultKey {
  const type = exercise.exerciseType ?? 'weighted';
  if (type === 'weighted' || (type === 'bodyweight' && hasWeight)) {
    return 'defaultWeightIncrement';
  }
  if (type === 'bodyweight') return 'defaultBodyweightIncrement';
  if (type === 'cardio') return 'defaultCardioIncrement';
  if (type === 'timed') return 'defaultTimedIncrement';
  if (type === 'plyo') return 'defaultPlyoIncrement';
  return 'defaultWeightIncrement';
}

const PROGRESSION_DEFAULT_CONFIGS: ProgressionDefaultConfig[] = [
  {
    key: 'defaultWeightIncrement',
    label: 'Weight',
    step: 0.5,
    isVisible: (exercises) =>
      exercises.some((exercise) => {
        const type = exercise.exerciseType ?? 'weighted';
        return type === 'weighted' || (type === 'bodyweight' && hasWeightInSets(exercise.sets));
      }),
    format: (value, weightUnit) => `+${value} ${weightUnit}`,
  },
  {
    key: 'defaultBodyweightIncrement',
    label: 'Bodyweight',
    step: 1,
    isVisible: (exercises) => exercises.some((exercise) => exercise.exerciseType === 'bodyweight'),
    format: (value) => `+${value} reps`,
  },
  {
    key: 'defaultCardioIncrement',
    label: 'Cardio',
    step: 5,
    isVisible: (exercises) => exercises.some((exercise) => exercise.exerciseType === 'cardio'),
    format: (value) => formatSecondsIncrement(value),
  },
  {
    key: 'defaultTimedIncrement',
    label: 'Timed',
    step: 1,
    isVisible: (exercises) => exercises.some((exercise) => exercise.exerciseType === 'timed'),
    format: (value) => `+${value} sec`,
  },
  {
    key: 'defaultPlyoIncrement',
    label: 'Plyo',
    step: 1,
    isVisible: (exercises) => exercises.some((exercise) => exercise.exerciseType === 'plyo'),
    format: (value) => `+${value} rep${value === 1 ? '' : 's'}`,
  },
];

function formatCustomUnitLabel(
  exerciseType: string,
  hasWeight: boolean,
  weightUnit: WeightUnit,
): string {
  const type = exerciseType ?? 'weighted';
  if (type === 'weighted') return weightUnit;
  if (type === 'bodyweight') return hasWeight ? weightUnit : 'reps';
  if (type === 'cardio') return 'sec';
  if (type === 'timed') return 'sec';
  if (type === 'plyo') return 'reps';
  return '';
}

export function ProgressionPromptModal({
  visible,
  title = 'Progress from last workout',
  subtitle,
  weightUnit,
  defaultIncrement,
  templateDefaults,
  exercises,
  allowPerExerciseEdit: _allowPerExerciseEdit,
  onConfirm,
  onSkipHistory,
  onClose,
}: ProgressionPromptModalProps) {
  const insets = useSafeAreaInsets();
  const resolvedDefaults = useMemo(
    () => resolveProgressionDefaults(weightUnit, defaultIncrement, templateDefaults),
    [defaultIncrement, templateDefaults, weightUnit],
  );
  const visibleDefaultConfigs = useMemo(
    () => PROGRESSION_DEFAULT_CONFIGS.filter((config) => config.isVisible(exercises)),
    [exercises],
  );
  const defaultConfigRows = useMemo(
    () => [
      visibleDefaultConfigs.slice(0, 2),
      visibleDefaultConfigs.slice(2, 4),
      visibleDefaultConfigs.slice(4, 5),
    ],
    [visibleDefaultConfigs],
  );
  const [defaultValues, setDefaultValues] = useState<ProgressionDefaultValues>(resolvedDefaults);
  const [exerciseStates, setExerciseStates] = useState<Record<string, ExerciseState>>({});
  const [expandedExercises, setExpandedExercises] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    setDefaultValues(resolvedDefaults);
    setExerciseStates(
      Object.fromEntries(
        exercises.map((exercise) => {
          const hasWeight = hasWeightInSets(exercise.sets);
          const { increment } = getDefaultProgressionForExercise(
            exercise.exerciseType,
            hasWeight,
            weightUnit,
            resolvedDefaults,
          );
          return [exercise.exerciseId, { mode: null, customValue: String(increment), increment }];
        }),
      ),
    );
    setExpandedExercises(new Set());
  }, [exercises, resolvedDefaults, visible, weightUnit]);

  const hasInvalidCustom = useMemo(
    () =>
      exercises.some((exercise) => {
        const state = exerciseStates[exercise.exerciseId];
        return state?.mode === 'custom' && parseIncrement(state.customValue) === null;
      }),
    [exerciseStates, exercises],
  );

  const getExerciseDefaultIncrement = (exercise: ProgressionExercisePreview) => {
    const hasWeight = hasWeightInSets(exercise.sets);
    return defaultValues[getDefaultKeyForExercise(exercise, hasWeight)];
  };

  const updateExerciseState = (exerciseId: string, updates: Partial<ExerciseState>) => {
    const exercise = exercises.find((candidate) => candidate.exerciseId === exerciseId);
    const defaultValue = exercise ? getExerciseDefaultIncrement(exercise) : defaultIncrement;
    setExerciseStates((current) => ({
      ...current,
      [exerciseId]: {
        mode: current[exerciseId]?.mode ?? null,
        customValue: current[exerciseId]?.customValue ?? String(defaultValue),
        increment: current[exerciseId]?.increment ?? defaultValue,
        ...updates,
      },
    }));
  };

  const handleStartWithSuggestions = () => {
    if (hasInvalidCustom) return;
    // Apply 'progress' to any unselected exercises, keep existing selections
    const updatedStates = { ...exerciseStates };
    for (const exercise of exercises) {
      const state = updatedStates[exercise.exerciseId];
      if (!state || state.mode === null) {
        const defaultValue = getExerciseDefaultIncrement(exercise);
        updatedStates[exercise.exerciseId] = {
          ...(state ?? { customValue: String(defaultValue), increment: defaultValue }),
          mode: 'progress',
        };
      }
    }
    setExerciseStates(updatedStates);
    // Build selections immediately with the updated states
    const selections = exercises.map((exercise) => {
      const state = updatedStates[exercise.exerciseId];
      const mode = state.mode ?? 'progress';
      const customIncrement = parseIncrement(state.customValue ?? '');
      const defaultInc = getExerciseDefaultIncrement(exercise);
      const resolvedIncrement = mode === 'custom' ? (customIncrement ?? defaultInc) : defaultInc;
      return {
        exerciseId: exercise.exerciseId,
        mode,
        increment: resolvedIncrement,
      };
    });
    onConfirm(selections);
  };

  const adjustDefaultIncrement = (key: ProgressionDefaultKey, delta: number) => {
    setDefaultValues((current) => ({
      ...current,
      [key]: Math.max(0, Number((current[key] + delta).toFixed(2))),
    }));
  };

  const toggleExpanded = (exerciseId: string) => {
    setExpandedExercises((prev) => {
      const next = new Set(prev);
      if (next.has(exerciseId)) next.delete(exerciseId);
      else next.add(exerciseId);
      return next;
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          <IconButton icon="close" label="Close" variant="ghost" size="sm" onPress={onClose} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}
        >
          <Surface style={styles.incrementSurface}>
            <Text style={styles.sectionLabel}>Default progression</Text>
            <Text style={styles.sectionSublabel}>Applied to available exercise history</Text>
            <View style={styles.incrementControlList}>
              {defaultConfigRows.map((row, rowIndex) =>
                row.length > 0 ? (
                  <View key={`default-progression-row:${rowIndex}`} style={styles.incrementGridRow}>
                    {row.map((config) => (
                      <View key={`default-progression:${config.key}`} style={styles.incrementItem}>
                        <Text style={styles.incrementLabel}>{config.label}</Text>
                        <View style={styles.incrementRow}>
                          <Pressable
                            style={styles.stepperButton}
                            onPress={() => adjustDefaultIncrement(config.key, -config.step)}
                          >
                            <Ionicons name="remove" size={18} color={text.primary} />
                          </Pressable>
                          <Text style={styles.incrementValue}>
                            {config.format(defaultValues[config.key], weightUnit)}
                          </Text>
                          <Pressable
                            style={styles.stepperButton}
                            onPress={() => adjustDefaultIncrement(config.key, config.step)}
                          >
                            <Ionicons name="add" size={18} color={text.primary} />
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null,
              )}
            </View>
          </Surface>

          {exercises.map((exercise) => {
            const state = exerciseStates[exercise.exerciseId] ?? {
              mode: null,
              customValue: String(getExerciseDefaultIncrement(exercise)),
              increment: getExerciseDefaultIncrement(exercise),
            };
            const customIncrement = parseIncrement(state.customValue);
            const hasWeight = hasWeightInSets(exercise.sets);
            const defaultInc = getExerciseDefaultIncrement(exercise);
            const previewIncrement =
              state.mode === 'custom' ? (customIncrement ?? defaultInc) : defaultInc;

            const lastSummary = getLastWorkoutSummary(
              exercise.sets,
              exercise.exerciseType,
              weightUnit,
            );
            const suggested = getSuggestedSummary(
              exercise.sets,
              exercise.exerciseType,
              previewIncrement,
              weightUnit,
            );
            const isExpanded = expandedExercises.has(exercise.exerciseId);

            return (
              <Surface
                key={`progression-exercise:${exercise.exerciseId}`}
                style={styles.exerciseSurface}
              >
                {/* Header */}
                <View style={styles.exerciseHeader}>
                  <View style={styles.exerciseHeaderText}>
                    <Text style={styles.exerciseName}>{exercise.name}</Text>
                    <Text style={styles.exerciseMeta}>
                      {formatDate(exercise.lastWorkoutDate)}
                      {exercise.isAmrap ? ' · AMRAP' : ''}
                    </Text>
                  </View>
                  <Text style={styles.setCount}>{exercise.sets.length} sets</Text>
                </View>

                {/* Summary row */}
                <Pressable
                  onPress={() => toggleExpanded(exercise.exerciseId)}
                  style={styles.summaryRowPressable}
                >
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryColumn}>
                      <Text style={styles.summaryLabel}>LAST</Text>
                      <Text style={styles.summaryValue}>{lastSummary}</Text>
                    </View>

                    <View style={styles.arrowContainer}>
                      <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
                    </View>

                    <View style={styles.summaryColumn}>
                      <Text style={[styles.summaryLabel, styles.suggestedLabel]}>SUGGESTED</Text>
                      <Text style={styles.summaryValue}>{suggested.summary}</Text>
                    </View>

                    <View style={styles.deltaBadge}>
                      <Text style={styles.deltaBadgeText}>{suggested.delta}</Text>
                    </View>
                  </View>

                  <View style={styles.expandHint}>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={colors.textMuted}
                    />
                  </View>
                </Pressable>

                {/* Expanded set list */}
                {isExpanded && (
                  <View style={styles.setList}>
                    {exercise.sets.map((set, index) => {
                      const nextSet = applyProgressionToHistorySet(
                        set,
                        previewIncrement,
                        exercise.exerciseType,
                      );
                      const showProgression = state.mode !== 'use_last';
                      return (
                        <View key={`${exercise.exerciseId}:set:${set.setNumber ?? index}`}>
                          <Text style={styles.setLine}>
                            Set {set.setNumber ?? index + 1} · {formatSetValue(set, weightUnit)}
                            {showProgression ? `  →  ${formatSetValue(nextSet, weightUnit)}` : ''}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Action buttons */}
                <View style={styles.modeRow}>
                  <Button
                    label="Use suggestion"
                    icon={state.mode === 'progress' ? 'checkmark-circle' : undefined}
                    variant="outline"
                    size="sm"
                    onPress={() => updateExerciseState(exercise.exerciseId, { mode: 'progress' })}
                    style={
                      state.mode === 'progress'
                        ? { borderColor: accent.primary, backgroundColor: accent.subtle }
                        : undefined
                    }
                    textStyle={state.mode === 'progress' ? { color: accent.primary } : undefined}
                  />
                  <Button
                    label="Use last"
                    variant="outline"
                    size="sm"
                    onPress={() => updateExerciseState(exercise.exerciseId, { mode: 'use_last' })}
                    style={
                      state.mode === 'use_last'
                        ? { borderColor: accent.primary, backgroundColor: accent.subtle }
                        : undefined
                    }
                    textStyle={state.mode === 'use_last' ? { color: accent.primary } : undefined}
                  />
                  <Button
                    label="Custom"
                    icon="options"
                    variant="outline"
                    size="sm"
                    onPress={() => updateExerciseState(exercise.exerciseId, { mode: 'custom' })}
                    style={
                      state.mode === 'custom'
                        ? { borderColor: accent.primary, backgroundColor: accent.subtle }
                        : undefined
                    }
                    textStyle={state.mode === 'custom' ? { color: accent.primary } : undefined}
                  />
                </View>

                {/* Custom input */}
                {state.mode === 'custom' ? (
                  <View style={styles.customRow}>
                    <Text style={styles.customLabel}>Increase by</Text>
                    <TextInput
                      value={state.customValue}
                      onChangeText={(customValue) =>
                        updateExerciseState(exercise.exerciseId, { customValue })
                      }
                      keyboardType="numbers-and-punctuation"
                      style={[
                        styles.customInput,
                        parseIncrement(state.customValue) === null ? styles.customInputError : null,
                      ]}
                      placeholder={String(defaultInc)}
                      placeholderTextColor={colors.placeholderText}
                    />
                    <Text style={styles.customUnit}>
                      {formatCustomUnitLabel(exercise.exerciseType, hasWeight, weightUnit)}
                    </Text>
                  </View>
                ) : null}
              </Surface>
            );
          })}

          <View style={styles.footer}>
            <Button
              label="Start with suggestions"
              icon="play"
              onPress={handleStartWithSuggestions}
              disabled={hasInvalidCustom}
            />
            <Button label="Start without history" variant="ghost" onPress={onSkipHistory} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.semibold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.base,
    lineHeight: 22,
  },
  content: {
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
  },
  incrementSurface: {
    gap: spacing.sm,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    textTransform: 'uppercase',
  },
  sectionSublabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
  },
  incrementControlList: {
    gap: spacing.md,
  },
  incrementGridRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  incrementItem: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  incrementLabel: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  incrementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  stepperButton: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  incrementValue: {
    flex: 1,
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    textAlign: 'center',
  },
  exerciseSurface: {
    gap: spacing.md,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  exerciseHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  exerciseName: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
  exerciseMeta: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
  },
  setCount: {
    color: accent.secondary,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  summaryRowPressable: {
    gap: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryColumn: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  suggestedLabel: {
    color: accent.primary,
  },
  summaryValue: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  arrowContainer: {
    paddingHorizontal: 2,
  },
  deltaBadge: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    flexShrink: 0,
  },
  deltaBadgeText: {
    color: colors.success,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
  },
  expandHint: {
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  setList: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  setLine: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    lineHeight: 20,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  customLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
  },
  customInput: {
    width: 96,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: border.default,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: typography.fontSizes.base,
    paddingHorizontal: spacing.md,
  },
  customInputError: {
    borderColor: colors.error,
  },
  customUnit: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
  },
  footer: {
    gap: spacing.sm,
  },
});
