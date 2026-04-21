import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Surface, Badge } from '@/components/ui/app-primitives';
import { colors, typography, spacing } from '@/theme';

interface MealCardProps {
  mealType: string;
  time: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const mealTypeToneMap: Record<string, 'orange' | 'sky' | 'emerald' | 'rose'> = {
  breakfast: 'orange',
  lunch: 'sky',
  dinner: 'emerald',
  snack: 'rose',
};

export function MealCard({ mealType, time, name, calories, protein, carbs, fat }: MealCardProps) {
  const tone = mealTypeToneMap[mealType.toLowerCase()] ?? 'neutral';

  return (
    <Surface style={styles.container}>
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
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
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
});
