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
}: MealCardProps) {
  const tone = mealTypeToneMap[mealType.toLowerCase()] ?? 'neutral';

  return (
    <Surface style={styles.container}>
      <View style={styles.cardBody}>
        <View style={styles.header}>
          <Badge label={mealType} tone={tone as 'orange' | 'sky' | 'emerald' | 'rose'} />
          <View style={styles.headerRight}>
            <Text style={styles.time}>{time}</Text>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onDelete?.(id);
              }}
              hitSlop={10}
              style={styles.deleteIcon}
            >
              <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
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
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  cardBody: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    padding: spacing.xs,
  },
});
