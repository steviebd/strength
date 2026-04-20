import { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { type TemplateExercise } from '@/hooks/useTemplateEditor';

type WeightUnit = 'kg' | 'lbs';

const KG_TO_LBS = 2.20462;
const LBS_TO_KG = 0.453592;

function toDisplayWeight(weightKg: number, unit: WeightUnit): number {
  return unit === 'lbs' ? weightKg * KG_TO_LBS : weightKg;
}

function toStorageWeight(weight: number, fromUnit: WeightUnit): number {
  return fromUnit === 'lbs' ? weight * LBS_TO_KG : weight;
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

  const handleWeightChange = useCallback((text: string) => {
    setLocalWeight(text);
  }, []);

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
    <View className="mb-3 rounded-xl border border-darkBorder bg-darkCard p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-darkText text-base font-semibold">{exercise.name}</Text>
          {exercise.muscleGroup && (
            <Text className="text-darkMuted text-xs">{exercise.muscleGroup}</Text>
          )}
        </View>
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={onMoveUp}
            disabled={isFirst}
            className={`h-8 w-8 items-center justify-center rounded-lg ${isFirst ? 'opacity-30' : 'bg-darkBorder'}`}
          >
            <Text className="text-darkText text-sm">↑</Text>
          </Pressable>
          <Pressable
            onPress={onMoveDown}
            disabled={isLast}
            className={`h-8 w-8 items-center justify-center rounded-lg ${isLast ? 'opacity-30' : 'bg-darkBorder'}`}
          >
            <Text className="text-darkText text-sm">↓</Text>
          </Pressable>
          <Pressable
            onPress={onRemove}
            className="ml-2 h-8 w-8 items-center justify-center rounded-lg bg-red-500/20"
          >
            <Text className="text-red-400 text-sm">×</Text>
          </Pressable>
        </View>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Text className="text-darkMuted mb-1 text-xs">Sets</Text>
          <TextInput
            className="rounded-lg border border-darkBorder bg-darkBg px-3 py-2 text-darkText"
            value={exercise.sets.toString()}
            onChangeText={(text) => {
              const num = parseInt(text, 10);
              if (!isNaN(num) && num >= 0) {
                onUpdate({ sets: num });
              }
            }}
            keyboardType="number-pad"
            selectTextOnFocus
          />
        </View>
        <View className="flex-1">
          <Text className="text-darkMuted mb-1 text-xs">Reps</Text>
          <TextInput
            className="rounded-lg border border-darkBorder bg-darkBg px-3 py-2 text-darkText"
            value={exercise.reps.toString()}
            onChangeText={(text) => {
              const num = parseInt(text, 10);
              if (!isNaN(num) && num >= 0) {
                onUpdate({ reps: num });
              }
            }}
            keyboardType="number-pad"
            selectTextOnFocus
          />
        </View>
        <View className="flex-1">
          <Text className="text-darkMuted mb-1 text-xs">Weight ({weightUnit})</Text>
          <TextInput
            className="rounded-lg border border-darkBorder bg-darkBg px-3 py-2 text-darkText"
            value={localWeight}
            onChangeText={handleWeightChange}
            onBlur={handleWeightBlur}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#71717a"
            selectTextOnFocus
          />
        </View>
      </View>

      <View className="mt-3 flex-row gap-4">
        <Pressable
          onPress={() => onUpdate({ isAmrap: !exercise.isAmrap })}
          className={`flex-row items-center gap-2 rounded-lg px-3 py-2 ${exercise.isAmrap ? 'bg-coral/20' : 'bg-darkBorder'}`}
        >
          <View
            className={`h-4 w-4 rounded ${exercise.isAmrap ? 'bg-coral' : 'border border-darkMuted'}`}
          />
          <Text className={`text-xs ${exercise.isAmrap ? 'text-coral' : 'text-darkMuted'}`}>
            AMRAP
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onUpdate({ isAccessory: !exercise.isAccessory })}
          className={`flex-row items-center gap-2 rounded-lg px-3 py-2 ${exercise.isAccessory ? 'bg-darkBorder' : 'bg-transparent'}`}
        >
          <View
            className={`h-4 w-4 rounded border ${exercise.isAccessory ? 'bg-darkMuted border-darkMuted' : 'border-darkMuted'}`}
          />
          <Text className={`text-xs ${exercise.isAccessory ? 'text-darkText' : 'text-darkMuted'}`}>
            Accessory
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onUpdate({ isRequired: !exercise.isRequired })}
          className={`flex-row items-center gap-2 rounded-lg px-3 py-2 ${!exercise.isRequired ? 'bg-darkBorder' : 'bg-transparent'}`}
        >
          <View
            className={`h-4 w-4 rounded ${!exercise.isRequired ? 'bg-darkMuted' : 'border border-darkMuted'}`}
          />
          <Text className={`text-xs ${!exercise.isRequired ? 'text-darkText' : 'text-darkMuted'}`}>
            Optional
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
