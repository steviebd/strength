import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { colors, typography, spacing } from '@/theme';

interface CalorieRingProps {
  consumed: number;
  target: number;
  unit?: 'kcal' | 'kj';
}

const SIZE = 180;
const HALF_SIZE = SIZE / 2;

const SPRING_CONFIG = { damping: 15, stiffness: 100 };

function getColorForProgress(progress: number): string {
  if (progress < 0.5) return colors.success;
  if (progress < 0.75) return colors.warning;
  if (progress < 0.9) return '#f97316';
  return colors.error;
}

function getProgressColorTier(progress: number): string {
  if (progress < 0.5) return colors.success;
  if (progress < 0.75) return colors.warning;
  if (progress < 0.9) return '#f97316';
  return colors.error;
}

export function CalorieRing({ consumed, target, unit = 'kcal' }: CalorieRingProps) {
  const progress = Math.min(Math.max(consumed / target, 0), 1);
  const color = getColorForProgress(progress);
  const tier2Color = getProgressColorTier(progress);

  const leftRotation = useSharedValue(0);
  const rightRotation = useSharedValue(0);

  useEffect(() => {
    const targetLeftRotation = progress * 360;
    const targetRightRotation = progress * 360;

    if (progress <= 0.5) {
      leftRotation.value = withSpring(targetLeftRotation, SPRING_CONFIG);
      rightRotation.value = withSpring(0, SPRING_CONFIG);
    } else {
      leftRotation.value = withSpring(180, SPRING_CONFIG);
      rightRotation.value = withSpring(targetRightRotation - 180, SPRING_CONFIG);
    }
  }, [progress, leftRotation, rightRotation]);

  const leftAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: HALF_SIZE / 2 },
      { rotate: `${leftRotation.value}deg` },
      { translateX: -HALF_SIZE / 2 },
    ],
  }));

  const rightAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -HALF_SIZE / 2 },
      { rotate: `${rightRotation.value}deg` },
      { translateX: HALF_SIZE / 2 },
    ],
  }));

  const remaining = target - consumed;
  const displayConsumed = unit === 'kj' ? Math.round(consumed * 4.184) : consumed;
  const displayTarget = unit === 'kj' ? Math.round(target * 4.184) : target;
  const displayRemaining = unit === 'kj' ? Math.round(remaining * 4.184) : remaining;
  const remainingColor = remaining <= 0 ? colors.error : colors.accent;

  return (
    <View style={styles.container}>
      <View style={styles.backgroundRing} />
      <View style={styles.progressContainer}>
        <Animated.View style={[styles.halfCircle, styles.leftHalf, leftAnimatedStyle]}>
          <View style={[styles.halfInner, { backgroundColor: color }]} />
        </Animated.View>
        <Animated.View style={[styles.halfCircle, styles.rightHalf, rightAnimatedStyle]}>
          <View style={[styles.halfInner, { backgroundColor: tier2Color }]} />
        </Animated.View>
      </View>
      <View style={styles.centerContent}>
        <Text style={styles.consumedText}>{displayConsumed}</Text>
        <Text style={styles.targetText}>
          of {displayTarget} {unit}
        </Text>
        <Text style={[styles.remainingText, { color: remainingColor }]}>
          {remaining <= 0 ? 'over target' : `${displayRemaining} left`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
    position: 'relative',
  },
  backgroundRing: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 16,
    borderColor: colors.surfaceAlt,
  },
  progressContainer: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    overflow: 'hidden',
    borderRadius: SIZE / 2,
  },
  halfCircle: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    overflow: 'hidden',
  },
  leftHalf: {
    left: 0,
  },
  rightHalf: {
    right: 0,
  },
  halfInner: {
    position: 'absolute',
    width: SIZE / 2,
    height: SIZE,
    borderRadius: SIZE / 2,
  },
  centerContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  consumedText: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  targetText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  remainingText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
  },
});
