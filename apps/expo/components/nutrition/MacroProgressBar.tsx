import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography } from '@/theme';

interface MacroProgressBarProps {
  label: string;
  consumed: number;
  target: number;
  unit: string;
  color: string;
}

export function MacroProgressBar({ label, consumed, target, unit, color }: MacroProgressBarProps) {
  const progress = target > 0 ? Math.min(consumed / target, 1) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {consumed}/{target}
          {unit}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.textMuted,
  },
  value: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.text,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});
