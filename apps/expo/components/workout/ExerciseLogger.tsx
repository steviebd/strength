import { useState, useCallback, useRef, type RefObject } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SetLogger } from './SetLogger';
import { colors, radius, spacing, typography } from '@/theme';

interface WorkoutSetData {
  id: string;
  reps: number;
  weight: number | null;
  duration: number;
  distance: number | null;
  height: number;
  completed: boolean;
}

interface Exercise {
  id: string;
  exerciseId: string;
  name: string;
  muscleGroup: string | null;
  exerciseType: string;
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
  getSetRef?: (setId: string) => RefObject<View | null>;
  onSetLayout?: (setId: string, layout: { y: number; height: number }) => void;
}

export function ExerciseLogger({
  exercise,
  sets,
  onSetsUpdate,
  onAddSet,
  onDeleteSet,
  weightUnit = 'kg',
  isEditMode = false,
  getSetRef,
  onSetLayout,
}: ExerciseLoggerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const setsContainerYRef = useRef(0);
  const setLocalLayoutsRef = useRef(new Map<string, { y: number; height: number }>());

  const completedSets = sets.filter((s) => s.completed).length;
  const totalSets = sets.length;
  const allCompleted = completedSets === totalSets && totalSets > 0;

  const isAmrapSet = exercise.isAmrap ?? false;

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
      duration: lastSet?.duration ?? 0,
      distance: lastSet?.distance ?? null,
      height: lastSet?.height ?? 0,
      completed: false,
    };

    if (onAddSet) {
      onAddSet(exercise.id, [...sets, newSet]);
    } else {
      onSetsUpdate([...sets, newSet]);
    }
  }, [exercise.id, onAddSet, onSetsUpdate, sets]);

  const handleSetLayout = useCallback(
    (setId: string, event: LayoutChangeEvent) => {
      const localLayout = {
        y: event.nativeEvent.layout.y,
        height: event.nativeEvent.layout.height,
      };
      setLocalLayoutsRef.current.set(setId, localLayout);
      onSetLayout?.(setId, {
        y: setsContainerYRef.current + localLayout.y,
        height: localLayout.height,
      });
    },
    [onSetLayout],
  );

  const handleSetsContainerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      setsContainerYRef.current = event.nativeEvent.layout.y;
      setLocalLayoutsRef.current.forEach((layout, setId) => {
        onSetLayout?.(setId, {
          y: setsContainerYRef.current + layout.y,
          height: layout.height,
        });
      });
    },
    [onSetLayout],
  );

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
        <View style={styles.setsContainer} onLayout={handleSetsContainerLayout}>
          {sets.map((set, index) => (
            <View key={`${set.id}-${index}`} onLayout={(event) => handleSetLayout(set.id, event)}>
              <SetLogger
                ref={getSetRef?.(set.id)}
                setNumber={index + 1}
                set={set}
                onUpdate={(updatedSet) => handleSetUpdate(index, updatedSet)}
                onDelete={onDeleteSet ? () => onDeleteSet(exercise.id, set.id) : undefined}
                weightUnit={weightUnit}
                isEditMode={isEditMode}
                exerciseType={exercise.exerciseType}
                exerciseName={exercise.name}
              />
            </View>
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
    fontSize: typography.fontSizes.xxs,
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
