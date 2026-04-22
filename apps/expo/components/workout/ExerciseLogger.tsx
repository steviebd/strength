import { useState, useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SetLogger } from './SetLogger';
import { colors, radius, spacing, typography } from '@/theme';

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
  useEffect(() => {
    console.log(
      '[DEBUG ExerciseLogger] Rendered:',
      exercise.name,
      '| sets:',
      sets.length,
      '| isExpanded:',
      true,
    );
  });
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

  const containerStyle = [
    styles.container,
    allCompleted ? styles.containerCompleted : styles.containerDefault,
  ];

  const numberBgStyle = [
    styles.numberBg,
    allCompleted ? styles.numberBgCompleted : styles.numberBgDefault,
  ];

  return (
    <View style={containerStyle}>
      <Pressable
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <View style={styles.headerLeft}>
          <View style={numberBgStyle}>
            <Text style={allCompleted ? styles.numberTextCompleted : styles.numberTextDefault}>
              {completedSets}/{totalSets}
            </Text>
          </View>
          <View style={styles.headerInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.exerciseName} numberOfLines={1}>
                {exercise.name}
              </Text>
              {isAmrapSet && (
                <View style={styles.amrapBadge}>
                  <Text style={styles.amrapText}>AMRAP</Text>
                </View>
              )}
            </View>
            <Text style={styles.muscleGroupText} numberOfLines={1}>
              {exercise.muscleGroup}
            </Text>
          </View>
        </View>
        <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
      </Pressable>

      {isExpanded && (
        <View style={styles.setsContainer}>
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
              style={({ pressed }) => [styles.addSetButton, pressed && styles.addSetButtonPressed]}
            >
              <Text style={styles.addSetText}>+ Add Set</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  containerCompleted: {
    borderColor: 'rgba(34,197,94,0.5)',
  },
  containerDefault: {
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  headerPressed: {
    backgroundColor: 'rgba(63,63,70,0.3)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
    minWidth: 0,
  },
  numberBg: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBgCompleted: {
    backgroundColor: 'rgba(34,197,94,0.2)',
  },
  numberBgDefault: {
    backgroundColor: 'rgba(239,111,79,0.2)',
  },
  numberTextCompleted: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.success,
  },
  numberTextDefault: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.accent,
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  exerciseName: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  amrapBadge: {
    borderRadius: 4,
    backgroundColor: 'rgba(245,158,11,0.2)',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  amrapText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.warning,
  },
  muscleGroupText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  expandIcon: {
    fontSize: 20,
    color: colors.textMuted,
  },
  setsContainer: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  addSetButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    paddingVertical: 12,
  },
  addSetButtonPressed: {
    opacity: 0.7,
  },
  addSetText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
  },
});
