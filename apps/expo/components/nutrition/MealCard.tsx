import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Surface, Badge } from '@/components/ui/app-primitives';
import { colors, typography, spacing } from '@/theme';

interface MealCardProps {
  id: string;
  mealType: string;
  time: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  onDelete?: (id: string) => void;
  onEdit?: (entry: {
    id: string;
    name: string;
    mealType: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }) => void;
}

const mealTypeToneMap: Record<string, 'orange' | 'sky' | 'emerald' | 'rose'> = {
  breakfast: 'orange',
  lunch: 'sky',
  dinner: 'emerald',
  snack: 'rose',
};

export function MealCard({
  id,
  mealType,
  time,
  name,
  calories,
  protein,
  carbs,
  fat,
  onDelete,
  onEdit,
}: MealCardProps) {
  const tone = mealTypeToneMap[mealType.toLowerCase()] ?? 'neutral';

  return (
    <Surface style={styles.container}>
      <Pressable
        onPress={() => onEdit?.({ id, name, mealType, calories, protein, carbs, fat })}
        style={styles.cardPressable}
      >
        <View style={styles.header}>
          <Badge label={mealType} tone={tone as 'orange' | 'sky' | 'emerald' | 'rose'} />
          <Text style={styles.time}>{time}</Text>
        </View>
        <Text style={styles.name}>{name}</Text>
        <View style={styles.macros}>
          <Text style={styles.calories}>{calories} cal</Text>
          <Text style={styles.macroDivider}>|</Text>
          <Text style={styles.macroText}>P {protein}g</Text>
          <Text style={styles.macroDivider}>|</Text>
          <Text style={styles.macroText}>C {carbs}g</Text>
          <Text style={styles.macroDivider}>|</Text>
          <Text style={styles.macroText}>F {fat}g</Text>
        </View>
      </Pressable>
      <Pressable onPress={() => onDelete?.(id)} style={styles.deleteIcon}>
        <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
      </Pressable>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  cardPressable: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  time: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
  },
  name: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  macros: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  calories: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.accent,
  },
  macroDivider: {
    fontSize: typography.fontSizes.sm,
    color: colors.border,
  },
  macroText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
  },
  deleteIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
});
