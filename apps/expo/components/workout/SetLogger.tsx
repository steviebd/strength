import { useState, useCallback, useMemo, useRef, forwardRef } from 'react';
import { Pressable, StyleSheet, Text, View, TextInput, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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

function getResponsiveSizes(width: number) {
  if (width < 380) {
    return { stepperSize: 32, inputHeight: 36, fontSize: 14 };
  }
  if (width < 430) {
    return { stepperSize: 36, inputHeight: 40, fontSize: 16 };
  }
  return { stepperSize: 40, inputHeight: 44, fontSize: 18 };
}

export const SetLogger = forwardRef<View, SetLoggerProps>(function SetLogger(
  { setNumber, set, onUpdate, onDelete, weightUnit = 'kg', isEditMode = false },
  ref,
) {
  const { width } = useWindowDimensions();
  const sizes = useMemo(() => getResponsiveSizes(width), [width]);
  const stepperSize = sizes.stepperSize;
  const repsStepperSize = Math.max(28, stepperSize - 8);
  const inputHeight = sizes.inputHeight;
  const fontSize = sizes.fontSize;

  const displayWeight = useMemo(
    () => convertToDisplayWeight(set.weight, weightUnit),
    [set.weight, weightUnit],
  );
  const [localWeight, setLocalWeight] = useState(displayWeight);
  const [localReps, setLocalReps] = useState(set.reps);
  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [editWeightValue, setEditWeightValue] = useState('');
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
    setEditWeightValue(localWeight.toString());
    scrollToInput(weightInputRef);
    setIsEditingWeight(true);
  }, [localWeight, scrollToInput]);

  const handleWeightEditEnd = useCallback(() => {
    const parsed = parseFloat(editWeightValue);
    if (!isNaN(parsed) && parsed >= 0) {
      setLocalWeight(parsed);
      const storageWeight = convertToStorageWeight(parsed, weightUnit);
      onUpdate({ ...set, weight: storageWeight });
    }
    setIsEditingWeight(false);
  }, [editWeightValue, weightUnit, onUpdate, set]);

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
    ? [styles.numberBg, styles.numberBgCompleted, { width: stepperSize, height: stepperSize }]
    : [styles.numberBg, styles.numberBgDefault, { width: stepperSize, height: stepperSize }];

  const completeBtnStyle = set.completed
    ? [styles.completeButton, styles.completeButtonDone]
    : [styles.completeButton, styles.completeButtonDefault];

  const stepperStyle = {
    width: stepperSize,
    height: stepperSize,
  };

  const repsStepperStyle = {
    width: repsStepperSize,
    height: repsStepperSize,
  };

  const inputStyle = {
    height: inputHeight,
  };

  return (
    <View ref={ref} style={containerStyle}>
      <View style={styles.headerRow}>
        <View style={numberBgStyle}>
          <Text style={[styles.numberText, { fontSize: fontSize }]}>{setNumber}</Text>
        </View>
        <Text style={styles.setTitle}>Set {setNumber}</Text>
      </View>

      <View style={styles.inputsRow}>
        <View style={[styles.inputSection, styles.weightSection]}>
          <Text numberOfLines={1} style={[styles.labelText, { fontSize: fontSize - 2 }]}>
            Weight
          </Text>
          <View style={styles.weightStepperGroup}>
            <Pressable
              onPress={handleWeightDecrease}
              disabled={!isEditMode}
              style={({ pressed }) => [
                styles.stepperButton,
                stepperStyle,
                !isEditMode && styles.stepperDisabled,
                pressed && styles.stepperPressed,
              ]}
            >
              <Ionicons name="remove" size={fontSize + 4} color={colors.textMuted} />
            </Pressable>
            <Pressable
              testID={`workout-set-${setNumber}-weight`}
              accessibilityLabel={`workout-set-${setNumber}-weight`}
              onPress={handleWeightEditStart}
              disabled={!isEditMode}
              style={({ pressed }) => [
                styles.inputButton,
                inputStyle,
                !isEditMode && styles.inputButtonDisabled,
                pressed && styles.stepperPressed,
              ]}
            >
              {isEditingWeight ? (
                <TextInput
                  testID={`workout-set-${setNumber}-weight-input`}
                  ref={weightInputRef}
                  style={[styles.weightInput, { fontSize }]}
                  value={editWeightValue}
                  onChangeText={setEditWeightValue}
                  onBlur={handleWeightEditEnd}
                  onSubmitEditing={handleWeightEditEnd}
                  keyboardType="decimal-pad"
                  autoFocus
                />
              ) : (
                <>
                  <Text
                    style={[styles.inputText, { fontSize }, !isEditMode && styles.textDisabled]}
                  >
                    {localWeight.toFixed(1)}
                  </Text>
                  <Text style={[styles.unitLabel, { fontSize: fontSize - 4 }]}>{weightUnit}</Text>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={handleWeightIncrease}
              disabled={!isEditMode}
              style={({ pressed }) => [
                styles.stepperButton,
                stepperStyle,
                !isEditMode && styles.stepperDisabled,
                pressed && styles.stepperPressed,
              ]}
            >
              <Ionicons name="add" size={fontSize + 4} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.inputSection, styles.repsSection]}>
          <Text numberOfLines={1} style={[styles.labelText, { fontSize: fontSize - 2 }]}>
            Reps
          </Text>
          <View style={styles.repsStepperGroup}>
            <Pressable
              onPress={handleRepsDecrease}
              disabled={!isEditMode}
              style={({ pressed }) => [
                styles.stepperButton,
                repsStepperStyle,
                !isEditMode && styles.stepperDisabled,
                pressed && styles.stepperPressed,
              ]}
            >
              <Ionicons name="remove" size={fontSize + 4} color={colors.textMuted} />
            </Pressable>
            <Pressable
              testID={`workout-set-${setNumber}-reps`}
              accessibilityLabel={`workout-set-${setNumber}-reps`}
              onPress={handleRepsEditStart}
              disabled={!isEditMode}
              style={({ pressed }) => [
                styles.inputButton,
                inputStyle,
                !isEditMode && styles.inputButtonDisabled,
                pressed && styles.stepperPressed,
              ]}
            >
              {isRepsEditing ? (
                <TextInput
                  testID={`workout-set-${setNumber}-reps-input`}
                  ref={repsInputRef}
                  style={[styles.repsInput, { fontSize }]}
                  value={editRepsValue}
                  onChangeText={setEditRepsValue}
                  onBlur={handleRepsEditEnd}
                  onSubmitEditing={handleRepsEditEnd}
                  keyboardType="number-pad"
                  autoFocus
                />
              ) : (
                <Text style={[styles.inputText, { fontSize }, !isEditMode && styles.textDisabled]}>
                  {localReps}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={handleRepsIncrease}
              disabled={!isEditMode}
              style={({ pressed }) => [
                styles.stepperButton,
                repsStepperStyle,
                !isEditMode && styles.stepperDisabled,
                pressed && styles.stepperPressed,
              ]}
            >
              <Ionicons name="add" size={fontSize + 4} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          testID={`workout-set-${setNumber}-complete`}
          accessibilityLabel={`workout-set-${setNumber}-complete`}
          onPress={handleToggleComplete}
          disabled={!isEditMode}
          style={({ pressed }) => [
            completeBtnStyle,
            !isEditMode && styles.buttonDisabled,
            pressed && styles.completePressed,
          ]}
        >
          {set.completed ? <Ionicons name="checkmark" size={fontSize} color={colors.text} /> : null}
          <Text
            style={[
              set.completed ? styles.completeTextDone : styles.completeTextDefault,
              { fontSize: fontSize },
            ]}
          >
            {set.completed ? 'Complete' : 'Mark Complete'}
          </Text>
        </Pressable>

        {onDelete && isEditMode && (
          <Pressable
            onPress={onDelete}
            style={({ pressed }) => [styles.deleteButton, pressed && styles.stepperPressed]}
          >
            <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  containerCompleted: {
    borderColor: 'rgba(34,197,94,0.5)',
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  containerDefault: {
    borderColor: colors.border,
    backgroundColor: 'rgba(24,24,27,0.4)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  setTitle: {
    flex: 1,
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
  },
  numberBg: {
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
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  inputsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  inputSection: {
    gap: spacing.sm,
    minWidth: 0,
  },
  weightSection: {
    flex: 3,
    flexBasis: 0,
  },
  repsSection: {
    flex: 2,
    flexBasis: 0,
  },
  labelText: {
    color: colors.textMuted,
    fontWeight: typography.fontWeights.medium,
    includeFontPadding: false,
  },
  weightStepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  repsStepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 0,
  },
  stepperButton: {
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
    color: colors.textMuted,
  },
  inputButton: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(63,63,70,0.7)',
    backgroundColor: 'rgba(24,24,27,0.7)',
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  inputButtonDisabled: {
    opacity: 0.5,
  },
  inputText: {
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    textAlign: 'center',
  },
  textDisabled: {
    opacity: 0.5,
  },
  weightInput: {
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    textAlign: 'center',
    minWidth: 40,
    flexShrink: 1,
    height: '100%',
    paddingVertical: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  unitLabel: {
    color: colors.textMuted,
    marginLeft: 2,
  },
  repsInput: {
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    textAlign: 'center',
    minWidth: 40,
    height: '100%',
    paddingVertical: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  footer: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  completeButton: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
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
