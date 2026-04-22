import { useState, useCallback, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, TextInput } from 'react-native';
import { useScrollToInput } from '@/context/ScrollContext';
import { colors, radius, spacing, typography } from '@/theme';

type WeightUnit = 'kg' | 'lbs';

interface WorkoutSetData {
  id: string;
  reps: number;
  weight: number;
  completed: boolean;
}

interface SetLoggerProps {
  setNumber: number;
  set: WorkoutSetData;
  onUpdate: (set: WorkoutSetData) => void;
  onDelete?: () => void;
  weightUnit?: WeightUnit;
  isEditMode?: boolean;
}

const KG_TO_LBS = 2.20462;

function convertToDisplayWeight(weightKg: number, unit: WeightUnit): number {
  return unit === 'lbs' ? weightKg * KG_TO_LBS : weightKg;
}

function convertToStorageWeight(weight: number, fromUnit: WeightUnit): number {
  return fromUnit === 'lbs' ? weight / KG_TO_LBS : weight;
}

export function SetLogger({
  setNumber,
  set,
  onUpdate,
  onDelete,
  weightUnit = 'kg',
  isEditMode = false,
}: SetLoggerProps) {
  const displayWeight = useMemo(
    () => convertToDisplayWeight(set.weight, weightUnit),
    [set.weight, weightUnit],
  );
  const [localWeight, setLocalWeight] = useState(displayWeight);
  const [localReps, setLocalReps] = useState(set.reps);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isRepsEditing, setIsRepsEditing] = useState(false);
  const [editRepsValue, setEditRepsValue] = useState('');
  const weightInputRef = useRef<any>(null);
  const repsInputRef = useRef<any>(null);
  const scrollToInput = useScrollToInput();

  const weightIncrement = weightUnit === 'kg' ? 1.0 : 2.5;

  const handleWeightDecrease = useCallback(() => {
    const newWeight = Math.max(0, localWeight - weightIncrement);
    setLocalWeight(newWeight);
    const storageWeight = convertToStorageWeight(newWeight, weightUnit);
    onUpdate({ ...set, weight: storageWeight });
  }, [localWeight, weightIncrement, weightUnit, onUpdate, set]);

  const handleWeightIncrease = useCallback(() => {
    const newWeight = localWeight + weightIncrement;
    setLocalWeight(newWeight);
    const storageWeight = convertToStorageWeight(newWeight, weightUnit);
    onUpdate({ ...set, weight: storageWeight });
  }, [localWeight, weightIncrement, weightUnit, onUpdate, set]);

  const handleWeightEditStart = useCallback(() => {
    setEditValue(localWeight.toString());
    scrollToInput(weightInputRef);
    setIsEditing(true);
  }, [localWeight, scrollToInput]);

  const handleWeightEditEnd = useCallback(() => {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed) && parsed >= 0) {
      setLocalWeight(parsed);
      const storageWeight = convertToStorageWeight(parsed, weightUnit);
      onUpdate({ ...set, weight: storageWeight });
    }
    setIsEditing(false);
  }, [editValue, weightUnit, onUpdate, set]);

  const handleRepsEditStart = useCallback(() => {
    setEditRepsValue(localReps.toString());
    scrollToInput(repsInputRef);
    setIsRepsEditing(true);
  }, [localReps, scrollToInput]);

  const handleRepsEditEnd = useCallback(() => {
    const parsed = parseInt(editRepsValue, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      setLocalReps(parsed);
      onUpdate({ ...set, reps: parsed });
    }
    setIsRepsEditing(false);
  }, [editRepsValue, onUpdate, set]);

  const handleRepsDecrease = useCallback(() => {
    const newReps = Math.max(0, localReps - 1);
    setLocalReps(newReps);
    onUpdate({ ...set, reps: newReps });
  }, [localReps, onUpdate, set]);

  const handleRepsIncrease = useCallback(() => {
    const newReps = localReps + 1;
    setLocalReps(newReps);
    onUpdate({ ...set, reps: newReps });
  }, [localReps, onUpdate, set]);

  const handleToggleComplete = useCallback(() => {
    onUpdate({ ...set, completed: !set.completed });
  }, [onUpdate, set]);

  const containerStyle = set.completed
    ? [styles.container, styles.containerCompleted]
    : [styles.container, styles.containerDefault];

  const numberBgStyle = set.completed
    ? [styles.numberBg, styles.numberBgCompleted]
    : [styles.numberBg, styles.numberBgDefault];

  const completeBtnStyle = set.completed
    ? [styles.completeButton, styles.completeButtonDone]
    : [styles.completeButton, styles.completeButtonDefault];

  return (
    <View style={containerStyle}>
      <View style={styles.row}>
        <View style={numberBgStyle}>
          <Text style={styles.numberText}>{setNumber}</Text>
        </View>

        <View style={styles.inputGroup}>
          <View style={styles.stepperRow}>
            <Pressable
              onPress={handleWeightDecrease}
              disabled={!isEditing}
              style={({ pressed }) => [
                styles.stepperButton,
                isEditing ? null : styles.stepperDisabled,
                pressed && styles.stepperPressed,
              ]}
            >
              <Text style={styles.stepperText}>−</Text>
            </Pressable>
            <Pressable
              onPress={handleWeightEditStart}
              disabled={!isEditMode}
              style={({ pressed }) => [
                styles.inputButton,
                !isEditMode && styles.inputButtonDisabled,
                pressed && styles.stepperPressed,
              ]}
            >
              {isEditing ? (
                <TextInput
                  ref={weightInputRef}
                  style={styles.weightInput}
                  value={editValue}
                  onChangeText={setEditValue}
                  onBlur={handleWeightEditEnd}
                  onSubmitEditing={handleWeightEditEnd}
                  keyboardType="decimal-pad"
                  autoFocus
                />
              ) : (
                <>
                  <Text style={[styles.inputText, !isEditMode && styles.textDisabled]}>
                    {localWeight.toFixed(1)}
                  </Text>
                  <Text style={styles.unitLabel}>{weightUnit}</Text>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={handleWeightIncrease}
              disabled={!isEditMode}
              style={({ pressed }) => [
                styles.stepperButton,
                !isEditMode && styles.stepperDisabled,
                pressed && styles.stepperPressed,
              ]}
            >
              <Text style={styles.stepperText}>+</Text>
            </Pressable>
          </View>

          <Text style={styles.multiplyText}>×</Text>

          <View style={styles.stepperRow}>
            <Pressable
              onPress={handleRepsDecrease}
              disabled={!isEditMode}
              style={({ pressed }) => [
                styles.stepperButton,
                !isEditMode && styles.stepperDisabled,
                pressed && styles.stepperPressed,
              ]}
            >
              <Text style={styles.stepperText}>−</Text>
            </Pressable>
            <View style={styles.repsButton}>
              {isRepsEditing ? (
                <TextInput
                  ref={repsInputRef}
                  style={styles.repsInput}
                  value={editRepsValue}
                  onChangeText={setEditRepsValue}
                  onBlur={handleRepsEditEnd}
                  onSubmitEditing={handleRepsEditEnd}
                  keyboardType="number-pad"
                  autoFocus
                />
              ) : (
                <Pressable onPress={handleRepsEditStart} disabled={!isEditMode}>
                  <Text style={[styles.inputText, !isEditMode && styles.textDisabled]}>
                    {localReps}
                  </Text>
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={handleRepsIncrease}
              disabled={!isEditMode}
              style={({ pressed }) => [
                styles.stepperButton,
                !isEditMode && styles.stepperDisabled,
                pressed && styles.stepperPressed,
              ]}
            >
              <Text style={styles.stepperText}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={handleToggleComplete}
          disabled={!isEditMode}
          style={({ pressed }) => [
            completeBtnStyle,
            !isEditMode && styles.buttonDisabled,
            pressed && styles.completePressed,
          ]}
        >
          <Text style={set.completed ? styles.completeTextDone : styles.completeTextDefault}>
            {set.completed ? '✓ Complete' : 'Mark Complete'}
          </Text>
        </Pressable>

        {onDelete && isEditMode && (
          <Pressable
            onPress={onDelete}
            style={({ pressed }) => [styles.deleteButton, pressed && styles.stepperPressed]}
          >
            <Text style={styles.deleteText}>🗑</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
  },
  containerCompleted: {
    borderColor: 'rgba(34,197,94,0.5)',
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  containerDefault: {
    borderColor: colors.border,
    backgroundColor: 'rgba(24,24,27,0.4)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  numberBg: {
    width: 48,
    height: 48,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBgCompleted: {
    backgroundColor: 'rgba(34,197,94,0.2)',
  },
  numberBgDefault: {
    backgroundColor: colors.border,
  },
  numberText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  inputGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepperButton: {
    width: 48,
    height: 48,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(24,24,27,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDisabled: {
    opacity: 0.5,
  },
  stepperPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.8,
  },
  stepperText: {
    fontSize: 20,
    color: colors.textMuted,
  },
  inputButton: {
    height: 48,
    minWidth: 96,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(63,63,70,0.7)',
    backgroundColor: 'rgba(24,24,27,0.7)',
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  inputButtonDisabled: {
    opacity: 0.5,
  },
  inputText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  textDisabled: {
    opacity: 0.5,
  },
  weightInput: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    width: '100%',
    textAlign: 'center',
  },
  unitLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
    marginLeft: 2,
  },
  multiplyText: {
    fontSize: 20,
    fontWeight: typography.fontWeights.bold,
    color: colors.textMuted,
  },
  repsButton: {
    height: 48,
    width: 56,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(63,63,70,0.7)',
    backgroundColor: 'rgba(24,24,27,0.7)',
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repsInput: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    width: '100%',
    textAlign: 'center',
  },
  footer: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  completeButton: {
    flex: 1,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  completeButtonDone: {
    backgroundColor: colors.success,
  },
  completeButtonDefault: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  completePressed: {
    opacity: 0.8,
  },
  completeTextDone: {
    color: colors.text,
    fontWeight: typography.fontWeights.semibold,
  },
  completeTextDefault: {
    color: colors.text,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  deleteText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
  },
});
