import { useState, useCallback, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { type TemplateExercise } from '@/hooks/useTemplateEditor';
import { colors, spacing, radius } from '@/theme';

type WeightUnit = 'kg' | 'lbs';

const KG_TO_LBS = 2.20462;
const LBS_TO_KG = 0.453592;
const DEFAULT_TEMPLATE_SETS = 1;
const DEFAULT_TEMPLATE_REPS = 5;

function toDisplayWeight(weightKg: number, unit: WeightUnit): number {
  return unit === 'lbs' ? weightKg * KG_TO_LBS : weightKg;
}

function toStorageWeight(weight: number, fromUnit: WeightUnit): number {
  return fromUnit === 'lbs' ? weight * LBS_TO_KG : weight;
}

function parsePositiveInteger(text: string): number | null {
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

interface TemplateExerciseRowProps {
  exercise: TemplateExercise;
  onUpdate: (updates: Partial<TemplateExercise>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  weightUnit?: WeightUnit;
}

export function TemplateExerciseRow({
  exercise,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  weightUnit = 'kg',
}: TemplateExerciseRowProps) {
  const displayWeight = toDisplayWeight(exercise.targetWeight, weightUnit);
  const [localWeight, setLocalWeight] = useState(displayWeight.toString());
  const [localSets, setLocalSets] = useState((exercise.sets || DEFAULT_TEMPLATE_SETS).toString());
  const [localReps, setLocalReps] = useState(
    exercise.repsRaw || (exercise.reps || DEFAULT_TEMPLATE_REPS).toString(),
  );

  useEffect(() => {
    setLocalSets((exercise.sets || DEFAULT_TEMPLATE_SETS).toString());
  }, [exercise.sets]);

  useEffect(() => {
    setLocalReps(exercise.repsRaw || (exercise.reps || DEFAULT_TEMPLATE_REPS).toString());
  }, [exercise.reps, exercise.repsRaw]);

  const handleWeightChange = useCallback((text: string) => {
    setLocalWeight(text);
  }, []);

  const handleSetsChange = useCallback(
    (text: string) => {
      setLocalSets(text);
      const sets = parsePositiveInteger(text);
      if (sets !== null) {
        onUpdate({ sets });
      }
    },
    [onUpdate],
  );

  const handleSetsBlur = useCallback(() => {
    const sets = parsePositiveInteger(localSets) ?? DEFAULT_TEMPLATE_SETS;
    setLocalSets(sets.toString());
    onUpdate({ sets });
  }, [localSets, onUpdate]);

  const handleRepsChange = useCallback(
    (text: string) => {
      setLocalReps(text);
      const reps = parsePositiveInteger(text);
      if (reps !== null) {
        onUpdate({ reps, repsRaw: text });
      } else {
        onUpdate({ repsRaw: text });
      }
    },
    [onUpdate],
  );

  const handleRepsBlur = useCallback(() => {
    const reps = parsePositiveInteger(localReps) ?? DEFAULT_TEMPLATE_REPS;
    setLocalReps(reps.toString());
    onUpdate({ reps, repsRaw: reps.toString() });
  }, [localReps, onUpdate]);

  const handleWeightBlur = useCallback(() => {
    const num = parseFloat(localWeight);
    if (!isNaN(num) && num >= 0) {
      const storageWeight = toStorageWeight(num, weightUnit);
      onUpdate({ targetWeight: storageWeight });
    } else {
      setLocalWeight(displayWeight.toString());
    }
  }, [localWeight, weightUnit, displayWeight, onUpdate]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.exerciseInfo}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          {exercise.muscleGroup && <Text style={styles.muscleGroup}>{exercise.muscleGroup}</Text>}
        </View>
        <View style={styles.controls}>
          <Pressable
            onPress={onMoveUp}
            disabled={isFirst}
            style={[styles.controlButton, isFirst && styles.controlButtonDisabled]}
          >
            <Text style={styles.controlButtonText}>↑</Text>
          </Pressable>
          <Pressable
            onPress={onMoveDown}
            disabled={isLast}
            style={[styles.controlButton, isLast && styles.controlButtonDisabled]}
          >
            <Text style={styles.controlButtonText}>↓</Text>
          </Pressable>
          <Pressable onPress={onRemove} style={styles.removeButton}>
            <Text style={styles.removeButtonText}>×</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.inputRow}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Sets</Text>
          <TextInput
            style={styles.input}
            value={localSets}
            onChangeText={handleSetsChange}
            onBlur={handleSetsBlur}
            keyboardType="number-pad"
            selectTextOnFocus
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Reps</Text>
          <TextInput
            style={styles.input}
            value={localReps}
            onChangeText={handleRepsChange}
            onBlur={handleRepsBlur}
            keyboardType="number-pad"
            selectTextOnFocus
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Weight ({weightUnit})</Text>
          <TextInput
            style={styles.input}
            value={localWeight}
            onChangeText={handleWeightChange}
            onBlur={handleWeightBlur}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.placeholderText}
            selectTextOnFocus
          />
        </View>
      </View>

      <View style={styles.toggleRow}>
        <Pressable
          onPress={() => onUpdate({ isAmrap: !exercise.isAmrap })}
          style={[styles.toggle, exercise.isAmrap && styles.toggleActive]}
        >
          <View style={[styles.toggleCheck, exercise.isAmrap && styles.toggleCheckActive]} />
          <Text
            style={[
              styles.toggleLabel,
              exercise.isAmrap ? styles.toggleLabelActive : styles.toggleLabelDefault,
            ]}
          >
            AMRAP
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onUpdate({ isAccessory: !exercise.isAccessory })}
          style={[styles.toggle, exercise.isAccessory && styles.toggleInactive]}
        >
          <View
            style={[
              styles.toggleCheck,
              exercise.isAccessory ? styles.toggleCheckInactive : styles.toggleCheckDefault,
            ]}
          />
          <Text
            style={[
              styles.toggleLabel,
              exercise.isAccessory ? styles.toggleLabelActive : styles.toggleLabelDefault,
            ]}
          >
            Accessory
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onUpdate({ isRequired: !exercise.isRequired })}
          style={[styles.toggle, !exercise.isRequired && styles.toggleInactive]}
        >
          <View
            style={[
              styles.toggleCheck,
              !exercise.isRequired ? styles.toggleCheckInactive : styles.toggleCheckDefault,
            ]}
          />
          <Text
            style={[
              styles.toggleLabel,
              !exercise.isRequired ? styles.toggleLabelActive : styles.toggleLabelDefault,
            ]}
          >
            Optional
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  muscleGroup: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  controlButton: {
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: spacing.sm,
    backgroundColor: colors.surfaceAlt,
  },
  controlButtonDisabled: {
    opacity: 0.3,
  },
  controlButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  removeButton: {
    marginLeft: spacing.sm,
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: spacing.sm,
    backgroundColor: 'rgba(239,68,68,0.2)',
  },
  removeButtonText: {
    fontSize: 14,
    color: colors.error,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toggleActive: {
    backgroundColor: 'rgba(239,111,79,0.2)',
  },
  toggleInactive: {
    backgroundColor: 'transparent',
  },
  toggleCheck: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.textMuted,
  },
  toggleCheckActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  toggleCheckDefault: {
    borderColor: colors.textMuted,
  },
  toggleCheckInactive: {
    backgroundColor: colors.textMuted,
    borderColor: colors.textMuted,
  },
  toggleLabel: {
    fontSize: 12,
  },
  toggleLabelActive: {
    color: colors.accent,
  },
  toggleLabelDefault: {
    color: colors.textMuted,
  },
});
