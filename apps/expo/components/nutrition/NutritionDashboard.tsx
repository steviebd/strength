import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  Badge,
  MetricTile,
  SectionTitle,
  SegmentedTabs,
  Surface,
} from '@/components/ui/app-primitives';
import { MealCard } from './MealCard';
import { colors, radius, spacing, textRoles, typography } from '@/theme';

type TrainingType = 'rest_day' | 'cardio' | 'powerlifting';

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

interface TargetMeta {
  strategy: 'manual' | 'bodyweight' | 'default';
  explanation: string;
  calorieMultiplier: number;
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
  targetMeta: TargetMeta;
  bodyweightKg: number | null;
  trainingType: TrainingType;
  onTrainingTypeChange: (type: TrainingType) => void;
  whoopData?: WhoopData | null;
  onMealDelete: (entryId: string) => void;
}

const trainingTypeOptions = [
  { label: 'Rest', value: 'rest_day' as const },
  { label: 'Cardio', value: 'cardio' as const },
  { label: 'Lift', value: 'powerlifting' as const },
];

const recoveryToneMap = {
  green: 'emerald',
  yellow: 'orange',
  red: 'rose',
} as const;

function formatTime(loggedAt: string | null): string {
  if (!loggedAt) return '';
  const date = new Date(loggedAt);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatTrainingSummary(trainingType: TrainingType): string {
  if (trainingType === 'powerlifting')
    return 'Lift day selected. Calories are biased upward for heavier training.';
  if (trainingType === 'cardio')
    return 'Cardio day selected. Calories are adjusted slightly upward.';
  return 'Rest day selected. Calories are held a little lower than a training day.';
}

export function NutritionDashboard({
  entries,
  totals,
  targets,
  targetMeta,
  bodyweightKg,
  trainingType,
  onTrainingTypeChange,
  whoopData,
  onMealDelete,
}: NutritionDashboardProps) {
  const remainingCalories = Math.round(targets.calories - totals.calories);
  const progress = targets.calories > 0 ? Math.min(totals.calories / targets.calories, 1) : 0;
  const progressWidth = `${progress > 0 ? progress * 100 : 0}%` as `${number}%`;
  const isOverTarget = remainingCalories < 0;
  const summaryTone =
    targetMeta.strategy === 'manual'
      ? 'sky'
      : targetMeta.strategy === 'bodyweight'
        ? 'orange'
        : 'neutral';

  const handleDeletePress = (entryId: string) => {
    Alert.alert('Delete Meal', 'Are you sure you want to delete this meal?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onMealDelete(entryId) },
    ]);
  };

  return (
    <View style={styles.container}>
      <Surface>
        <View style={styles.summaryHeader}>
          <View style={styles.summaryText}>
            <Text style={styles.summaryLabel}>Today&apos;s intake</Text>
            <Text style={styles.summaryValue}>
              {Math.round(totals.calories)} / {targets.calories}
            </Text>
            <Text style={[styles.summaryDelta, isOverTarget && styles.summaryDeltaOver]}>
              {isOverTarget
                ? `${Math.abs(remainingCalories)} over`
                : `${remainingCalories} remaining`}
            </Text>
          </View>
          <Badge
            label={
              targetMeta.strategy === 'manual'
                ? 'Manual targets'
                : targetMeta.strategy === 'bodyweight'
                  ? 'Bodyweight based'
                  : 'Default targets'
            }
            tone={summaryTone}
          />
        </View>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: progressWidth },
              isOverTarget ? styles.progressFillOver : undefined,
            ]}
          />
        </View>

        <Text style={styles.summaryExplanation}>{targetMeta.explanation}</Text>
      </Surface>

      <View style={styles.macroRow}>
        <MetricTile
          label="Protein"
          value={`${Math.round(totals.proteinG)}g`}
          hint={`of ${targets.proteinG}g`}
          tone="emerald"
        />
        <MetricTile
          label="Carbs"
          value={`${Math.round(totals.carbsG)}g`}
          hint={`of ${targets.carbsG}g`}
          tone="sky"
        />
        <MetricTile
          label="Fat"
          value={`${Math.round(totals.fatG)}g`}
          hint={`of ${targets.fatG}g`}
          tone="orange"
        />
      </View>

      <Surface>
        <SectionTitle title="Training Context" />
        <SegmentedTabs
          options={trainingTypeOptions.map((option) => ({
            label: option.label,
            active: trainingType === option.value,
            onPress: () => onTrainingTypeChange(option.value),
          }))}
        />

        <View style={styles.contextDetails}>
          {bodyweightKg ? (
            <View style={styles.contextRow}>
              <Text style={styles.contextLabel}>Target basis</Text>
              <Text style={styles.contextValue}>
                {bodyweightKg} kg bodyweight
                {targetMeta.strategy === 'manual' ? ' with manual profile overrides' : ''}
              </Text>
            </View>
          ) : (
            <View style={styles.contextRow}>
              <Text style={styles.contextLabel}>Target basis</Text>
              <Text style={styles.contextValue}>Using app defaults until bodyweight is saved</Text>
            </View>
          )}

          <View style={styles.contextRow}>
            <Text style={styles.contextLabel}>Day adjustment</Text>
            <Text style={styles.contextValue}>{formatTrainingSummary(trainingType)}</Text>
          </View>

          {whoopData?.recoveryStatus ? (
            <View style={styles.contextWhoopRow}>
              <Badge
                label={`Recovery ${whoopData.recoveryStatus.toUpperCase()}`}
                tone={recoveryToneMap[whoopData.recoveryStatus]}
              />
              {whoopData.recoveryScore !== null ? (
                <Text style={styles.contextMeta}>{whoopData.recoveryScore}%</Text>
              ) : null}
              {whoopData.totalStrain !== null ? (
                <Text style={styles.contextMeta}>Strain {whoopData.totalStrain}</Text>
              ) : null}
              {whoopData.caloriesBurned !== null ? (
                <Text style={styles.contextMeta}>{whoopData.caloriesBurned} burned</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Surface>

      <Surface>
        <SectionTitle title="Meals Today" />
        {entries.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No meals logged yet</Text>
            <Text style={styles.emptyStateText}>
              Capture a meal photo, describe what you ate, or add a meal manually.
            </Text>
          </View>
        ) : (
          <View style={styles.mealList}>
            {entries.map((entry) => (
              <MealCard
                key={`nutrition-entry:${entry.id}`}
                id={entry.id}
                mealType={entry.mealType ?? 'snack'}
                time={formatTime(entry.loggedAt)}
                name={entry.name ?? 'Unnamed meal'}
                calories={entry.calories ?? 0}
                protein={entry.proteinG ?? 0}
                carbs={entry.carbsG ?? 0}
                fat={entry.fatG ?? 0}
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
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  summaryText: {
    flex: 1,
    gap: spacing.xs,
  },
  summaryLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    letterSpacing: 1.2,
    color: colors.textMuted,
    textTransform: 'uppercase',
    lineHeight: textRoles.metricLabel.lineHeight,
  },
  summaryValue: {
    fontSize: typography.fontSizes.xxxl,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    lineHeight: textRoles.display.lineHeight,
  },
  summaryDelta: {
    fontSize: typography.fontSizes.base,
    color: colors.textMuted,
    lineHeight: textRoles.body.lineHeight,
  },
  summaryDeltaOver: {
    color: colors.error,
  },
  progressTrack: {
    height: 10,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  progressFillOver: {
    backgroundColor: colors.error,
  },
  summaryExplanation: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    lineHeight: textRoles.bodySmall.lineHeight,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  contextDetails: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  contextRow: {
    gap: spacing.xs,
  },
  contextLabel: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    letterSpacing: 1.2,
    color: colors.textMuted,
    textTransform: 'uppercase',
    lineHeight: textRoles.caption.lineHeight,
  },
  contextValue: {
    fontSize: typography.fontSizes.base,
    color: colors.text,
    lineHeight: textRoles.body.lineHeight,
  },
  contextWhoopRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  contextMeta: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    lineHeight: textRoles.bodySmall.lineHeight,
  },
  emptyState: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: spacing.lg,
    gap: spacing.xs,
  },
  emptyStateTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    lineHeight: textRoles.sectionTitle.lineHeight,
  },
  emptyStateText: {
    fontSize: typography.fontSizes.base,
    color: colors.textMuted,
    lineHeight: textRoles.body.lineHeight,
  },
  mealList: {
    gap: spacing.md,
  },
});
