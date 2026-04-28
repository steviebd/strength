import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '@/theme';

const ICON_SIZE = 18;
const DOT_SIZE = 6;
const ANIMATION_DURATION = 600;

function Dot({ delay }: { delay: number }) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-4, { duration: ANIMATION_DURATION, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: ANIMATION_DURATION, easing: Easing.in(Easing.quad) }),
      ),
      -1,
      false,
    );

    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: ANIMATION_DURATION, easing: Easing.out(Easing.quad) }),
        withTiming(0.5, { duration: ANIMATION_DURATION, easing: Easing.in(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [delay, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

export function CoachTypingIndicator() {
  const iconScale = useSharedValue(1);
  const iconOpacity = useSharedValue(0.7);

  useEffect(() => {
    iconScale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 750, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 750, easing: Easing.in(Easing.quad) }),
      ),
      -1,
      false,
    );

    iconOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 750, easing: Easing.out(Easing.quad) }),
        withTiming(0.7, { duration: 750, easing: Easing.in(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [iconOpacity, iconScale]);

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
    opacity: iconOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={iconAnimatedStyle}>
        <Ionicons name="nutrition-outline" size={ICON_SIZE} color={colors.accent} />
      </Animated.View>
      <View style={styles.dotsContainer}>
        <Dot delay={0} />
        <Dot delay={1} />
        <Dot delay={2} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: colors.textMuted,
  },
});
