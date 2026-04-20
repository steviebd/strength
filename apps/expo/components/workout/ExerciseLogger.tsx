import { useState, useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SetLogger } from './SetLogger';

interface WorkoutSetData {
  id: string;
  reps: number;
  weight: number;
  completed: boolean;
}

interface Exercise {
  id: string;
  exerciseId: string;
  name: string;
  muscleGroup: string | null;
  isAmrap?: boolean;
}

interface ExerciseLoggerProps {
  exercise: Exercise;
  sets: WorkoutSetData[];
  onSetsUpdate: (sets: WorkoutSetData[]) => void;
  onAddSet?: (exerciseId: string, currentSets: WorkoutSetData[]) => void;
  onDeleteSet?: (exerciseId: string, setId: string) => void;
  weightUnit?: 'kg' | 'lbs';
  isEditMode?: boolean;
}

export function ExerciseLogger({
  exercise,
  sets,
  onSetsUpdate,
  onAddSet,
  onDeleteSet,
  weightUnit = 'kg',
  isEditMode = false,
}: ExerciseLoggerProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const completedSets = sets.filter((s) => s.completed).length;
  const totalSets = sets.length;
  const allCompleted = completedSets === totalSets && totalSets > 0;

  const isAmrapSet = exercise.isAmrap ?? exercise.name.endsWith('3+');

  const handleSetUpdate = useCallback(
    (index: number, updatedSet: WorkoutSetData) => {
      const newSets = [...sets];
      newSets[index] = updatedSet;
      onSetsUpdate(newSets);
    },
    [sets, onSetsUpdate],
  );

  const handleAddSet = useCallback(() => {
    const lastSet = sets[sets.length - 1];
    const newSet: WorkoutSetData = {
      id: Math.random().toString(36).substring(2, 15),
      reps: lastSet?.reps ?? 0,
      weight: lastSet?.weight ?? 0,
      completed: false,
    };

    if (onAddSet) {
      onAddSet(exercise.id, [...sets, newSet]);
    } else {
      onSetsUpdate([...sets, newSet]);
    }
  }, [exercise.id, onAddSet, onSetsUpdate, sets]);

  return (
    <View
      className={`rounded-xl border overflow-hidden ${
        allCompleted ? 'border-green-500/50' : 'border-darkBorder'
      }`}
    >
      <Pressable
        className="flex flex-row items-center justify-between p-4 hover:bg-darkBorder/30 transition-colors"
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <View className="flex flex-row items-center gap-3 flex-1 min-w-0">
          <View
            className={`flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold ${
              allCompleted ? 'bg-green-500/20 text-green-500' : 'bg-coral/20 text-coral'
            }`}
          >
            <Text className="text-sm font-bold">
              {completedSets}/{totalSets}
            </Text>
          </View>
          <View className="flex-1 min-w-0">
            <View className="flex flex-row items-center gap-2">
              <Text className="text-darkText text-base font-semibold truncate">
                {exercise.name}
              </Text>
              {isAmrapSet && (
                <View className="rounded bg-amber-500/20 px-1 py-0.5">
                  <Text className="text-[10px] font-bold text-amber-500">AMRAP</Text>
                </View>
              )}
            </View>
            <Text className="text-darkMuted text-xs truncate">{exercise.muscleGroup}</Text>
          </View>
        </View>
        <Text className="text-darkMuted text-xl">{isExpanded ? '▲' : '▼'}</Text>
      </Pressable>

      {isExpanded && (
        <View className="space-y-2 px-3 pb-3">
          {sets.map((set, index) => (
            <SetLogger
              key={set.id}
              setNumber={index + 1}
              set={set}
              onUpdate={(updatedSet) => handleSetUpdate(index, updatedSet)}
              onDelete={onDeleteSet ? () => onDeleteSet(exercise.id, set.id) : undefined}
              weightUnit={weightUnit}
              isEditMode={isEditMode}
            />
          ))}

          {isEditMode && (
            <Pressable
              onPress={handleAddSet}
              className="flex w-full flex-row items-center justify-center gap-1.5 rounded-lg border border-dashed border-darkBorder py-3"
            >
              <Text className="text-darkMuted text-sm">+ Add Set</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
