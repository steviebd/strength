import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Surface, SegmentedTabs, MetricTile, Badge } from '@/components/ui/app-primitives';
import { CalorieRing } from './CalorieRing';
import { MealCard } from './MealCard';
import { colors, spacing, typography } from '@/theme';

interface MealEntry {
  id: string;
  name: string | null;
  mealType: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  loggedAt: string | null;
}

interface WhoopData {
  recoveryScore: number | null;
  recoveryStatus: 'green' | 'yellow' | 'red' | null;
  hrv: number | null;
  caloriesBurned: number | null;
  totalStrain: number | null;
}

interface NutritionDashboardProps {
  entries: MealEntry[];
  totals: { calories: number; proteinG: number; carbsG: number; fatG: number };
  targets: { calories: number; proteinG: number; carbsG: number; fatG: number };
  trainingType: 'rest_day' | 'cardio' | 'powerlifting' | null;
  onTrainingTypeChange: (type: 'rest_day' | 'cardio' | 'powerlifting') => void;
  whoopData?: WhoopData | null;
  onMealEdit: (entry: MealEntry) => void;
  onMealDelete: (entryId: string) => void;
}

const trainingTypeOptions = [
  { label: 'Rest Day', value: 'rest_day' as const },
  { label: 'Cardio', value: 'cardio' as const },
  { label: 'Powerlifting', value: 'powerlifting' as const },
];

export function NutritionDashboard({
  entries,
  totals,
  targets,
  trainingType,
  onTrainingTypeChange,
  whoopData,
  onMealEdit,
  onMealDelete,
}: NutritionDashboardProps) {
  const handleDeletePress = (entryId: string) => {
    Alert.alert('Delete Meal', 'Are you sure you want to delete this meal?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onMealDelete(entryId) },
    ]);
  };

  const formatTime = (loggedAt: string | null): string => {
    if (!loggedAt) return '';
    const date = new Date(loggedAt);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <View style={styles.container}>
      <Surface style={styles.section}>
        <SegmentedTabs
          options={trainingTypeOptions.map((opt) => ({
            label: opt.label,
            active: trainingType === opt.value,
            onPress: () => onTrainingTypeChange(opt.value),
          }))}
        />
      </Surface>

      <Surface style={styles.section}>
        <View style={styles.calorieRingContainer}>
          <CalorieRing consumed={totals.calories} target={targets.calories} />
        </View>
      </Surface>

      <View style={styles.macroRow}>
        <MetricTile
          label="Protein"
          value={`${totals.proteinG.toFixed(0)}g / ${targets.proteinG}g`}
          tone="emerald"
        />
        <MetricTile
          label="Carbs"
          value={`${totals.carbsG.toFixed(0)}g / ${targets.carbsG}g`}
          tone="sky"
        />
        <MetricTile
          label="Fat"
          value={`${totals.fatG.toFixed(0)}g / ${targets.fatG}g`}
          tone="orange"
        />
      </View>

      {whoopData && (
        <Surface style={styles.section}>
          <Text style={styles.whoopTitle}>WHOOP</Text>
          <View style={styles.whoopMetricsRow}>
            {whoopData.recoveryScore !== null && whoopData.recoveryScore !== undefined && (
              <View style={styles.whoopMetric}>
                <Badge
                  label={whoopData.recoveryStatus?.toUpperCase() ?? 'N/A'}
                  tone={
                    whoopData.recoveryStatus === 'green'
                      ? 'emerald'
                      : whoopData.recoveryStatus === 'yellow'
                        ? 'orange'
                        : 'rose'
                  }
                />
                <Text style={styles.whoopMetricLabel}>Recovery</Text>
                <Text style={styles.whoopMetricValue}>{whoopData.recoveryScore}%</Text>
              </View>
            )}
            {whoopData.hrv !== null && whoopData.hrv !== undefined && (
              <View style={styles.whoopMetric}>
                <Text style={styles.whoopMetricLabel}>HRV</Text>
                <Text style={styles.whoopMetricValue}>{whoopData.hrv}ms</Text>
              </View>
            )}
            {whoopData.totalStrain !== null && whoopData.totalStrain !== undefined && (
              <View style={styles.whoopMetric}>
                <Text style={styles.whoopMetricLabel}>Strain</Text>
                <Text style={styles.whoopMetricValue}>{whoopData.totalStrain}</Text>
              </View>
            )}
            {whoopData.caloriesBurned !== null && whoopData.caloriesBurned !== undefined && (
              <View style={styles.whoopMetric}>
                <Text style={styles.whoopMetricLabel}>Burned</Text>
                <Text style={styles.whoopMetricValue}>{whoopData.caloriesBurned}</Text>
              </View>
            )}
          </View>
        </Surface>
      )}

      <Surface style={styles.section}>
        <Text style={styles.sectionTitle}>Today's Meals</Text>
        {entries.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No meals logged yet</Text>
          </View>
        ) : (
          <View style={styles.mealList}>
            {entries.map((entry) => (
              <MealCard
                key={entry.id}
                id={entry.id}
                mealType={entry.mealType ?? 'snack'}
                time={formatTime(entry.loggedAt)}
                name={entry.name ?? 'Unnamed meal'}
                calories={entry.calories ?? 0}
                protein={entry.proteinG ?? 0}
                carbs={entry.carbsG ?? 0}
                fat={entry.fatG ?? 0}
                onEdit={() => onMealEdit(entry)}
                onDelete={() => handleDeletePress(entry.id)}
              />
            ))}
          </View>
        )}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  calorieRingContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  whoopTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  whoopMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  whoopMetric: {
    minWidth: 70,
  },
  whoopMetricLabel: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.xs,
  },
  whoopMetricValue: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyStateText: {
    fontSize: typography.fontSizes.base,
    color: colors.textMuted,
  },
  mealList: {
    gap: spacing.md,
  },
});
