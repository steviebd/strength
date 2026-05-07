import { useState, useCallback, useEffect, useMemo, useRef, forwardRef } from 'react';
import { Pressable, StyleSheet, Text, View, TextInput, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useScrollToInput } from '@/context/ScrollContext';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { colors, radius, spacing, typography } from '@/theme';
import { formatDuration, formatDistance, formatHeight } from '@/lib/units';
import { DurationPickerModal } from './DurationPickerModal';
import { DistancePickerModal } from './DistancePickerModal';
import { HeightPickerModal } from './HeightPickerModal';

type WeightUnit = 'kg' | 'lbs';

interface WorkoutSetData {
  id: string;
  reps: number;
  weight: number | null;
  duration: number;
  distance: number | null;
  height: number;
  completed: boolean;
}

interface SetLoggerProps {
  setNumber: number;
  set: WorkoutSetData;
  onUpdate: (set: WorkoutSetData) => void;
  onDelete?: () => void;
  weightUnit?: WeightUnit;
  isEditMode?: boolean;
  exerciseType: string;
  exerciseName?: string;
}

const KG_TO_LBS = 2.20462;

function convertToDisplayWeight(weightKg: number | null, unit: WeightUnit): number {
  if (weightKg === null) return 0;
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
  {
    setNumber,
    set,
    onUpdate,
    onDelete,
    weightUnit = 'kg',
    isEditMode = false,
    exerciseType,
    exerciseName = '',
  },
  ref,
) {
  const { width } = useWindowDimensions();
  const sizes = useMemo(() => getResponsiveSizes(width), [width]);
  const stepperSize = sizes.stepperSize;
  const repsStepperSize = Math.max(28, stepperSize - 8);
  const inputHeight = sizes.inputHeight;
  const fontSize = sizes.fontSize;

  const { distanceUnit, heightUnit } = useUserPreferences();

  const displayWeight = useMemo(
    () => convertToDisplayWeight(set.weight, weightUnit),
    [set.weight, weightUnit],
  );
  const [localWeight, setLocalWeight] = useState(displayWeight);
  const [localReps, setLocalReps] = useState(set.reps);
  const [localDuration, setLocalDuration] = useState(set.duration);
  const [localDistance, setLocalDistance] = useState(set.distance);
  const [localHeight, setLocalHeight] = useState(set.height);
  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [editWeightValue, setEditWeightValue] = useState('');
  const [isRepsEditing, setIsRepsEditing] = useState(false);
  const [editRepsValue, setEditRepsValue] = useState('');
  const [showDurationModal, setShowDurationModal] = useState(false);
  const [showDistanceModal, setShowDistanceModal] = useState(false);
  const [showHeightModal, setShowHeightModal] = useState(false);
  const weightWrapperRef = useRef<View>(null);
  const repsWrapperRef = useRef<View>(null);
  const latestSetRef = useRef(set);
  const scrollToInput = useScrollToInput();

  useEffect(() => {
    latestSetRef.current = set;
    setLocalWeight(displayWeight);
    setLocalReps(set.reps);
    setLocalDuration(set.duration);
    setLocalDistance(set.distance);
    setLocalHeight(set.height);
  }, [displayWeight, set]);

  const emitUpdate = useCallback(
    (updates: Partial<WorkoutSetData>) => {
      const next = { ...latestSetRef.current, ...updates };
      latestSetRef.current = next;
      onUpdate(next);
    },
    [onUpdate],
  );

  const weightIncrement = weightUnit === 'kg' ? 1.0 : 2.5;

  const handleWeightDecrease = useCallback(() => {
    const newWeight = Math.max(0, localWeight - weightIncrement);
    setLocalWeight(newWeight);
    const storageWeight = convertToStorageWeight(newWeight, weightUnit);
    emitUpdate({ weight: storageWeight });
  }, [emitUpdate, localWeight, weightIncrement, weightUnit]);

  const handleWeightIncrease = useCallback(() => {
    const newWeight = localWeight + weightIncrement;
    setLocalWeight(newWeight);
    const storageWeight = convertToStorageWeight(newWeight, weightUnit);
    emitUpdate({ weight: storageWeight });
  }, [emitUpdate, localWeight, weightIncrement, weightUnit]);

  const handleWeightEditStart = useCallback(() => {
    setEditWeightValue(localWeight.toString());
    scrollToInput(weightWrapperRef);
    setIsEditingWeight(true);
  }, [localWeight, scrollToInput]);

  const handleWeightEditChange = useCallback(
    (value: string) => {
      setEditWeightValue(value);
      const parsed = parseFloat(value);
      if (!isNaN(parsed) && parsed >= 0) {
        setLocalWeight(parsed);
        const storageWeight = convertToStorageWeight(parsed, weightUnit);
        emitUpdate({ weight: storageWeight });
      }
    },
    [emitUpdate, weightUnit],
  );

  const handleWeightEditEnd = useCallback(() => {
    const parsed = parseFloat(editWeightValue);
    if (!isNaN(parsed) && parsed >= 0) {
      setLocalWeight(parsed);
      const storageWeight = convertToStorageWeight(parsed, weightUnit);
      emitUpdate({ weight: storageWeight });
    }
    setIsEditingWeight(false);
  }, [editWeightValue, emitUpdate, weightUnit]);

  const handleRepsEditStart = useCallback(() => {
    setEditRepsValue(localReps.toString());
    scrollToInput(repsWrapperRef);
    setIsRepsEditing(true);
  }, [localReps, scrollToInput]);

  const handleRepsEditChange = useCallback(
    (value: string) => {
      setEditRepsValue(value);
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        setLocalReps(parsed);
        emitUpdate({ reps: parsed });
      }
    },
    [emitUpdate],
  );

  const handleRepsEditEnd = useCallback(() => {
    const parsed = parseInt(editRepsValue, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      setLocalReps(parsed);
      emitUpdate({ reps: parsed });
    }
    setIsRepsEditing(false);
  }, [editRepsValue, emitUpdate]);

  const handleRepsDecrease = useCallback(() => {
    const newReps = Math.max(0, localReps - 1);
    setLocalReps(newReps);
    emitUpdate({ reps: newReps });
  }, [emitUpdate, localReps]);

  const handleRepsIncrease = useCallback(() => {
    const newReps = localReps + 1;
    setLocalReps(newReps);
    emitUpdate({ reps: newReps });
  }, [emitUpdate, localReps]);

  const handleToggleComplete = useCallback(() => {
    emitUpdate({ completed: !latestSetRef.current.completed });
  }, [emitUpdate]);

  const durationIncrement = useMemo(() => {
    const name = exerciseName.toLowerCase();
    if (name.includes('row')) return 15;
    if (name.includes('treadmill') || name.includes('bike')) return 60;
    return 5;
  }, [exerciseName]);

  const handleDurationDecrease = useCallback(() => {
    const newDuration = Math.max(0, localDuration - durationIncrement);
    setLocalDuration(newDuration);
    emitUpdate({ duration: newDuration });
  }, [emitUpdate, localDuration, durationIncrement]);

  const handleDurationIncrease = useCallback(() => {
    const newDuration = localDuration + durationIncrement;
    setLocalDuration(newDuration);
    emitUpdate({ duration: newDuration });
  }, [emitUpdate, localDuration, durationIncrement]);

  const handleDurationSave = useCallback(
    (seconds: number) => {
      setLocalDuration(seconds);
      emitUpdate({ duration: seconds });
      setShowDurationModal(false);
    },
    [emitUpdate],
  );

  const handleDistanceDecrease = useCallback(() => {
    if (localDistance === null) return;
    const newDistance = Math.max(0, localDistance - 100);
    setLocalDistance(newDistance);
    emitUpdate({ distance: newDistance });
  }, [emitUpdate, localDistance]);

  const handleDistanceIncrease = useCallback(() => {
    const current = localDistance ?? 0;
    const newDistance = current + 100;
    setLocalDistance(newDistance);
    emitUpdate({ distance: newDistance });
  }, [emitUpdate, localDistance]);

  const handleDistanceSave = useCallback(
    (meters: number) => {
      setLocalDistance(meters);
      emitUpdate({ distance: meters });
      setShowDistanceModal(false);
    },
    [emitUpdate],
  );

  const heightIncrement = useMemo(() => (heightUnit === 'cm' ? 5 : 2 * 2.54), [heightUnit]);

  const handleHeightDecrease = useCallback(() => {
    const newHeight = Math.max(0, localHeight - heightIncrement);
    setLocalHeight(newHeight);
    emitUpdate({ height: newHeight });
  }, [emitUpdate, localHeight, heightIncrement]);

  const handleHeightIncrease = useCallback(() => {
    const newHeight = localHeight + heightIncrement;
    setLocalHeight(newHeight);
    emitUpdate({ height: newHeight });
  }, [emitUpdate, localHeight, heightIncrement]);

  const handleHeightSave = useCallback(
    (cm: number) => {
      setLocalHeight(cm);
      emitUpdate({ height: cm });
      setShowHeightModal(false);
    },
    [emitUpdate],
  );

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

  const renderStepperButton = (
    onPress: () => void,
    icon: 'remove' | 'add',
    disabled?: boolean,
    sizeStyle?: { width: number; height: number },
    styleOverride?: object,
  ) => (
    <Pressable
      onPress={onPress}
      disabled={!isEditMode || disabled}
      style={({ pressed }) => [
        styles.stepperButton,
        sizeStyle ?? stepperStyle,
        !isEditMode && styles.stepperDisabled,
        pressed && styles.stepperPressed,
        styleOverride,
      ]}
    >
      <Ionicons name={icon} size={fontSize + 4} color={colors.textMuted} />
    </Pressable>
  );

  const renderNumberInput = (
    value: string | number,
    onPress: () => void,
    isEditing: boolean,
    editInput: React.ReactNode,
    testIdSuffix: string,
    extraStyle?: object,
    textStyle?: object,
  ) => (
    <Pressable
      testID={`workout-set-${setNumber}-${testIdSuffix}`}
      accessibilityLabel={`workout-set-${setNumber}-${testIdSuffix}`}
      onPress={onPress}
      disabled={!isEditMode}
      style={({ pressed }) => [
        styles.inputButton,
        inputStyle,
        !isEditMode && styles.inputButtonDisabled,
        pressed && styles.stepperPressed,
        extraStyle,
      ]}
    >
      {isEditing ? (
        editInput
      ) : (
        <Text
          style={[styles.inputText, { fontSize }, !isEditMode && styles.textDisabled, textStyle]}
          numberOfLines={1}
        >
          {value}
        </Text>
      )}
    </Pressable>
  );

  const renderWeightSection = () => {
    const isWeightGreyed = exerciseType === 'bodyweight' && localWeight === 0;
    const greyedStyle = isWeightGreyed ? { opacity: 0.4 } : undefined;
    const greyedTextStyle = isWeightGreyed ? { color: colors.textMuted } : undefined;
    return (
      <View style={[styles.inputSection, styles.weightSection]}>
        <Text numberOfLines={1} style={[styles.labelText, { fontSize: fontSize - 2 }]}>
          Weight
        </Text>
        <View style={styles.weightStepperGroup}>
          {renderStepperButton(handleWeightDecrease, 'remove', undefined, undefined, greyedStyle)}
          <View ref={weightWrapperRef} collapsable={false} style={{ flex: 1 }}>
            {renderNumberInput(
              localWeight.toFixed(1),
              handleWeightEditStart,
              isEditingWeight,
              <TextInput
                testID={`workout-set-${setNumber}-weight-input`}
                style={[styles.weightInput, { fontSize }]}
                value={editWeightValue}
                onChangeText={handleWeightEditChange}
                onBlur={handleWeightEditEnd}
                onSubmitEditing={handleWeightEditEnd}
                keyboardType="decimal-pad"
                autoFocus
              />,
              'weight',
              undefined,
              greyedTextStyle,
            )}
          </View>
          <Text style={[styles.unitLabel, { fontSize: fontSize - 4 }, greyedTextStyle]}>
            {weightUnit}
          </Text>
          {renderStepperButton(handleWeightIncrease, 'add', undefined, undefined, greyedStyle)}
        </View>
      </View>
    );
  };

  const renderRepsSection = () => (
    <View style={[styles.inputSection, styles.repsSection]}>
      <Text numberOfLines={1} style={[styles.labelText, { fontSize: fontSize - 2 }]}>
        Reps
      </Text>
      <View style={styles.repsStepperGroup}>
        {renderStepperButton(handleRepsDecrease, 'remove', undefined, repsStepperStyle)}
        <View ref={repsWrapperRef} collapsable={false} style={{ flex: 1 }}>
          {renderNumberInput(
            localReps,
            handleRepsEditStart,
            isRepsEditing,
            <TextInput
              testID={`workout-set-${setNumber}-reps-input`}
              style={[styles.repsInput, { fontSize }]}
              value={editRepsValue}
              onChangeText={handleRepsEditChange}
              onBlur={handleRepsEditEnd}
              onSubmitEditing={handleRepsEditEnd}
              keyboardType="number-pad"
              autoFocus
            />,
            'reps',
          )}
        </View>
        {renderStepperButton(handleRepsIncrease, 'add', undefined, repsStepperStyle)}
      </View>
    </View>
  );

  const renderDurationSection = (label = 'Duration') => (
    <View style={[styles.inputSection, { flex: 1 }]}>
      <Text numberOfLines={1} style={[styles.labelText, { fontSize: fontSize - 2 }]}>
        {label}
      </Text>
      <View style={styles.weightStepperGroup}>
        {renderStepperButton(handleDurationDecrease, 'remove')}
        <Pressable
          testID={`workout-set-${setNumber}-duration`}
          accessibilityLabel={`workout-set-${setNumber}-duration`}
          onPress={() => isEditMode && setShowDurationModal(true)}
          disabled={!isEditMode}
          style={({ pressed }) => [
            styles.inputButton,
            inputStyle,
            !isEditMode && styles.inputButtonDisabled,
            pressed && styles.stepperPressed,
            { flex: 1 },
          ]}
        >
          <Text
            style={[styles.inputText, { fontSize }, !isEditMode && styles.textDisabled]}
            numberOfLines={1}
          >
            {formatDuration(localDuration)}
          </Text>
        </Pressable>
        {renderStepperButton(handleDurationIncrease, 'add')}
      </View>
    </View>
  );

  const renderDistanceSection = () => (
    <View style={[styles.inputSection, { flex: 1 }]}>
      <Text numberOfLines={1} style={[styles.labelText, { fontSize: fontSize - 2 }]}>
        Distance
      </Text>
      <View style={styles.weightStepperGroup}>
        {renderStepperButton(handleDistanceDecrease, 'remove')}
        <Pressable
          testID={`workout-set-${setNumber}-distance`}
          accessibilityLabel={`workout-set-${setNumber}-distance`}
          onPress={() => isEditMode && setShowDistanceModal(true)}
          disabled={!isEditMode}
          style={({ pressed }) => [
            styles.inputButton,
            inputStyle,
            !isEditMode && styles.inputButtonDisabled,
            pressed && styles.stepperPressed,
            { flex: 1 },
          ]}
        >
          <Text
            style={[styles.inputText, { fontSize }, !isEditMode && styles.textDisabled]}
            numberOfLines={1}
          >
            {localDistance !== null ? formatDistance(localDistance, distanceUnit) : '-'}
          </Text>
        </Pressable>
        {renderStepperButton(handleDistanceIncrease, 'add')}
      </View>
    </View>
  );

  const renderHeightSection = () => (
    <View style={[styles.inputSection, { flex: 1 }]}>
      <Text numberOfLines={1} style={[styles.labelText, { fontSize: fontSize - 2 }]}>
        Height
      </Text>
      <View style={styles.weightStepperGroup}>
        {renderStepperButton(handleHeightDecrease, 'remove')}
        <Pressable
          testID={`workout-set-${setNumber}-height`}
          accessibilityLabel={`workout-set-${setNumber}-height`}
          onPress={() => isEditMode && setShowHeightModal(true)}
          disabled={!isEditMode}
          style={({ pressed }) => [
            styles.inputButton,
            inputStyle,
            !isEditMode && styles.inputButtonDisabled,
            pressed && styles.stepperPressed,
            { flex: 1 },
          ]}
        >
          <Text
            style={[styles.inputText, { fontSize }, !isEditMode && styles.textDisabled]}
            numberOfLines={1}
          >
            {formatHeight(localHeight, heightUnit)}
          </Text>
        </Pressable>
        {renderStepperButton(handleHeightIncrease, 'add')}
      </View>
    </View>
  );

  const renderInputs = () => {
    switch (exerciseType) {
      case 'bodyweight':
        return (
          <View style={styles.inputsRow}>
            {renderRepsSection()}
            {renderWeightSection()}
          </View>
        );
      case 'timed':
        return (
          <View style={styles.inputsRow}>
            <View style={[styles.inputSection, { flex: 1 }]}>{renderDurationSection()}</View>
          </View>
        );
      case 'cardio':
        return (
          <View style={styles.inputsCol}>
            <View style={styles.inputsRow}>{renderDurationSection()}</View>
            <View style={styles.inputsRow}>{renderDistanceSection()}</View>
          </View>
        );
      case 'plyo':
        return (
          <View style={styles.inputsRow}>
            <View style={[styles.inputSection, { flex: 2 }]}>{renderRepsSection()}</View>
            <View style={[styles.inputSection, { flex: 3 }]}>{renderHeightSection()}</View>
          </View>
        );
      case 'weights':
      default:
        return (
          <View style={styles.inputsRow}>
            {renderWeightSection()}
            {renderRepsSection()}
          </View>
        );
    }
  };

  return (
    <View ref={ref} style={containerStyle}>
      <View style={styles.headerRow}>
        <View style={numberBgStyle}>
          <Text style={[styles.numberText, { fontSize }]}>{setNumber}</Text>
        </View>
        <Text style={styles.setTitle}>Set {setNumber}</Text>
      </View>

      {renderInputs()}

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
              { fontSize },
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

      <DurationPickerModal
        visible={showDurationModal}
        initialSeconds={localDuration}
        onSave={handleDurationSave}
        onCancel={() => setShowDurationModal(false)}
      />
      <DistancePickerModal
        visible={showDistanceModal}
        initialMeters={localDistance}
        unit={distanceUnit}
        onSave={handleDistanceSave}
        onCancel={() => setShowDistanceModal(false)}
      />
      <HeightPickerModal
        visible={showHeightModal}
        initialCm={localHeight}
        unit={heightUnit}
        onSave={handleHeightSave}
        onCancel={() => setShowHeightModal(false)}
      />
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
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  inputsCol: {
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
