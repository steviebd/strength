import React from 'react';
import { Pressable, Text, StyleSheet, type PressableProps } from 'react-native';
import { colors, radius, typography } from '@/theme';

type ButtonVariant = 'default' | 'outline' | 'ghost';
type ButtonSize = 'default' | 'sm' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
  style?: object;
}

const variantStyles = StyleSheet.create({
  default: {
    backgroundColor: colors.accent,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
});

const sizeStyles = StyleSheet.create({
  default: {
    height: 48,
    paddingHorizontal: 16,
  },
  sm: {
    height: 40,
    paddingHorizontal: 12,
  },
  lg: {
    height: 56,
    paddingHorizontal: 24,
  },
});

const textColors: Record<ButtonVariant, string> = {
  default: '#ffffff',
  outline: colors.text,
  ghost: colors.textMuted,
};

export function Button({
  variant = 'default',
  size = 'default',
  disabled,
  onPress,
  children,
  style,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        sizeStyles[size],
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {typeof children === 'string' ? (
        <Text style={[styles.text, { color: textColors[variant] }]}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    transform: [{ scale: 0.95 }],
  },
});
