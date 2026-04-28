import React from 'react';
import { Pressable, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { radius, text, layout } from '@/theme';

type IconButtonVariant = 'ghost' | 'secondary' | 'outline' | 'danger';
type IconButtonSize = 'sm' | 'md' | 'lg';

interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const variantStyles: Record<
  IconButtonVariant,
  { bg: string; bgPressed: string; iconColor: string }
> = {
  ghost: {
    bg: 'transparent',
    bgPressed: 'rgba(255,255,255,0.08)',
    iconColor: text.secondary,
  },
  secondary: {
    bg: '#27272a',
    bgPressed: '#3f3f46',
    iconColor: text.primary,
  },
  outline: {
    bg: 'transparent',
    bgPressed: 'rgba(255,255,255,0.05)',
    iconColor: text.primary,
  },
  danger: {
    bg: 'rgba(239,68,68,0.15)',
    bgPressed: 'rgba(239,68,68,0.25)',
    iconColor: text.danger,
  },
};

const sizeStyles: Record<IconButtonSize, { container: number; iconSize: number }> = {
  sm: { container: 32, iconSize: 16 },
  md: { container: 40, iconSize: 20 },
  lg: { container: 48, iconSize: 24 },
};

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  disabled = false,
  onPress,
  style,
}: IconButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? v.bgPressed : v.bg,
          width: s.container,
          height: s.container,
          minWidth: layout.minTouchTarget,
          minHeight: layout.minTouchTarget,
        },
        disabled && styles.disabled,
        style,
      ]}
    >
      <Ionicons name={icon} size={s.iconSize} color={v.iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});
