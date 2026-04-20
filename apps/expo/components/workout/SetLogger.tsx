import { useState, useCallback, useMemo, useRef } from 'react';
import { Pressable, Text, View, TextInput } from 'react-native';
import { useScrollToInput } from '@/context/ScrollContext';

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
  const weightInputRef = useRef<TextInput>(null);
  const repsInputRef = useRef<TextInput>(null);
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

  return (
    <View
      className={`rounded-xl border p-3 ${
        set.completed ? 'border-green-500/50 bg-green-500/10' : 'border-darkBorder bg-darkCard/40'
      }`}
    >
      <View className="flex flex-row items-center gap-3">
        <View className="flex h-12 w-12 items-center justify-center rounded-full bg-darkBorder text-sm font-bold">
          <Text className="text-darkText text-base font-bold">{setNumber}</Text>
        </View>

        <View className="flex flex-1 flex-row items-center justify-center gap-2">
          <View className="flex flex-row items-center gap-1">
            <Pressable
              onPress={handleWeightDecrease}
              disabled={!isEditing}
              className={`flex h-12 w-12 items-center justify-center rounded-full border border-darkBorder bg-darkCard/70 active:scale-95 ${!isEditing ? 'opacity-50' : ''}`}
            >
              <Text className="text-darkMuted text-xl">−</Text>
            </Pressable>
            <Pressable
              onPress={handleWeightEditStart}
              disabled={!isEditMode}
              className={`flex h-12 min-w-24 items-center justify-center rounded-lg border border-darkBorder/70 bg-darkCard/70 px-2 ${!isEditMode ? 'opacity-50' : ''}`}
            >
              {isEditing ? (
                <TextInput
                  ref={weightInputRef}
                  className="text-darkText text-base font-bold w-full text-center"
                  value={editValue}
                  onChangeText={setEditValue}
                  onBlur={handleWeightEditEnd}
                  onSubmitEditing={handleWeightEditEnd}
                  keyboardType="decimal-pad"
                  autoFocus
                />
              ) : (
                <>
                  <Text className="text-darkText text-base font-bold">
                    {localWeight.toFixed(1)}
                  </Text>
                  <Text className="text-darkMuted text-xs ml-0.5">{weightUnit}</Text>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={handleWeightIncrease}
              disabled={!isEditMode}
              className={`flex h-12 w-12 items-center justify-center rounded-full border border-darkBorder bg-darkCard/70 active:scale-95 ${!isEditMode ? 'opacity-50' : ''}`}
            >
              <Text className="text-darkMuted text-xl">+</Text>
            </Pressable>
          </View>

          <Text className="text-darkMuted text-xl font-bold">×</Text>

          <View className="flex flex-row items-center gap-1">
            <Pressable
              onPress={handleRepsDecrease}
              disabled={!isEditMode}
              className={`flex h-12 w-12 items-center justify-center rounded-full border border-darkBorder bg-darkCard/70 active:scale-95 ${!isEditMode ? 'opacity-50' : ''}`}
            >
              <Text className="text-darkMuted text-xl">−</Text>
            </Pressable>
            <View className="flex h-12 w-14 items-center justify-center rounded-lg border border-darkBorder/70 bg-darkCard/70 px-2">
              {isRepsEditing ? (
                <TextInput
                  ref={repsInputRef}
                  className="text-darkText text-base font-bold w-full text-center"
                  value={editRepsValue}
                  onChangeText={setEditRepsValue}
                  onBlur={handleRepsEditEnd}
                  onSubmitEditing={handleRepsEditEnd}
                  keyboardType="number-pad"
                  autoFocus
                />
              ) : (
                <Pressable onPress={handleRepsEditStart} disabled={!isEditMode}>
                  <Text
                    className={`text-darkText text-base font-bold ${!isEditMode ? 'opacity-50' : ''}`}
                  >
                    {localReps}
                  </Text>
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={handleRepsIncrease}
              disabled={!isEditMode}
              className={`flex h-12 w-12 items-center justify-center rounded-full border border-darkBorder bg-darkCard/70 active:scale-95 ${!isEditMode ? 'opacity-50' : ''}`}
            >
              <Text className="text-darkMuted text-xl">+</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View className="mt-3 flex flex-row items-center gap-2">
        <Pressable
          onPress={handleToggleComplete}
          disabled={!isEditMode}
          className={`flex h-14 flex-1 items-center justify-center rounded-xl shadow-sm transition-all ${
            set.completed ? 'bg-green-500 text-white' : 'border border-darkBorder bg-darkCard'
          } ${!isEditMode ? 'opacity-50' : ''}`}
        >
          <Text className={set.completed ? 'text-white font-semibold' : 'text-darkText'}>
            {set.completed ? '✓ Complete' : 'Mark Complete'}
          </Text>
        </Pressable>

        {onDelete && isEditMode && (
          <Pressable
            onPress={onDelete}
            className="flex h-9 items-center justify-center rounded-lg border border-darkBorder bg-darkCard shadow-sm"
          >
            <Text className="text-darkMuted text-sm">🗑</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
