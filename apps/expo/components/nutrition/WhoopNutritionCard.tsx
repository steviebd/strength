import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Surface } from '@/components/ui/app-primitives';
import { colors, typography, spacing } from '@/theme';

interface WhoopNutritionCardProps {
  recoveryScore?: number | null;
  cycleScore?: number | null;
  strainScore?: number | null;
}

export function WhoopNutritionCard({
  recoveryScore,
  cycleScore,
  strainScore,
}: WhoopNutritionCardProps) {
  if (recoveryScore === null || recoveryScore === undefined) {
    return null;
  }

  const getStatusColor = (
    score: number | null | undefined,
    type: 'high' | 'medium' | 'low',
  ): string => {
    if (score === null || score === undefined) return colors.textMuted;

    if (type === 'high') {
      return score >= 70 ? colors.success : score >= 40 ? colors.warning : colors.error;
    }
    if (type === 'medium') {
      return score >= 60 ? colors.success : score >= 30 ? colors.warning : colors.error;
    }
    return score >= 50 ? colors.success : score >= 25 ? colors.warning : colors.error;
  };

  return (
    <Surface>
      <Text style={styles.title}>WHOOP Recovery</Text>

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Recovery</Text>
          <Text style={[styles.metricValue, { color: getStatusColor(recoveryScore, 'high') }]}>
            {recoveryScore !== null && recoveryScore !== undefined ? `${recoveryScore}%` : '--'}
          </Text>
        </View>

        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Cycle</Text>
          <Text style={[styles.metricValue, { color: getStatusColor(cycleScore, 'medium') }]}>
            {cycleScore !== null && cycleScore !== undefined ? `${cycleScore}%` : '--'}
          </Text>
        </View>

        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Strain</Text>
          <Text style={[styles.metricValue, { color: getStatusColor(strainScore, 'low') }]}>
            {strainScore !== null && strainScore !== undefined ? `${strainScore}` : '--'}
          </Text>
        </View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  metric: {
    flex: 1,
  },
  metricLabel: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  metricValue: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
  },
});
