import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  type ViewStyle,
  type TextStyle,
  type StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { accent, border, radius, text, textRoles, layout } from '@/theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'default';
type ButtonSize = 'sm' | 'md' | 'lg' | 'default';

interface ButtonProps {
  label?: string;
  children?: React.ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  numberOfLines?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const variantStyles: Record<
  ButtonVariant,
  { bg: string; bgPressed: string; textColor: string; borderColor: string; borderWidth: number }
> = {
  primary: {
    bg: accent.primary,
    bgPressed: accent.primaryPressed,
    textColor: text.primary,
    borderColor: 'transparent',
    borderWidth: 0,
  },
  secondary: {
    bg: '#27272a',
    bgPressed: '#3f3f46',
    textColor: text.primary,
    borderColor: 'transparent',
    borderWidth: 0,
  },
  outline: {
    bg: 'transparent',
    bgPressed: 'rgba(255,255,255,0.05)',
    textColor: text.primary,
    borderColor: border.default,
    borderWidth: 1,
  },
  ghost: {
    bg: 'transparent',
    bgPressed: 'rgba(255,255,255,0.05)',
    textColor: text.secondary,
    borderColor: 'transparent',
    borderWidth: 0,
  },
  danger: {
    bg: '#ef4444',
    bgPressed: '#dc2626',
    textColor: text.primary,
    borderColor: 'transparent',
    borderWidth: 0,
  },
  default: {
    bg: accent.primary,
    bgPressed: accent.primaryPressed,
    textColor: text.primary,
    borderColor: 'transparent',
    borderWidth: 0,
  },
};

const sizeStyles: Record<
  ButtonSize,
  { height: number; paddingHorizontal: number; iconSize: number; textRole: typeof textRoles.button }
> = {
  sm: {
    height: layout.controlHeightSmall,
    paddingHorizontal: 12,
    iconSize: 14,
    textRole: textRoles.buttonSmall,
  },
  md: {
    height: layout.controlHeight,
    paddingHorizontal: 16,
    iconSize: 16,
    textRole: textRoles.button,
  },
  default: {
    height: layout.controlHeight,
    paddingHorizontal: 16,
    iconSize: 16,
    textRole: textRoles.button,
  },
  lg: {
    height: 56,
    paddingHorizontal: 24,
    iconSize: 18,
    textRole: textRoles.button,
  },
};

export function Button({
  label,
  children,
  icon,
  rightIcon,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  loading = false,
  numberOfLines = 1,
  onPress,
  style,
  textStyle,
}: ButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];
  const content = label ?? children;
  const rendersText =
    typeof content === 'string' || typeof content === 'number' || typeof content === 'undefined';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? v.bgPressed : v.bg,
          borderColor: v.borderColor,
          borderWidth: v.borderWidth,
          minHeight: s.height,
          paddingHorizontal: s.paddingHorizontal,
        },
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        style,
      ]}
    >
      {(icon || loading) && (
        <>
          {icon && !loading && (
            <Ionicons name={icon} size={s.iconSize} color={v.textColor} style={styles.icon} />
          )}
          {loading && <ActivityIndicator size="small" color={v.textColor} style={styles.loader} />}
        </>
      )}
      {rendersText ? (
        <Text
          style={[
            styles.text,
            {
              color: v.textColor,
              fontSize: s.textRole.fontSize,
              lineHeight: s.textRole.lineHeight,
              fontWeight: s.textRole.fontWeight,
            },
            textStyle,
          ]}
          numberOfLines={numberOfLines}
          ellipsizeMode="tail"
        >
          {content}
        </Text>
      ) : (
        <View style={styles.customContent}>{content}</View>
      )}
      {rightIcon && (
        <Ionicons name={rightIcon} size={s.iconSize} color={v.textColor} style={styles.rightIcon} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minWidth: 0,
    flexShrink: 1,
  },
  fullWidth: {
    width: '100%',
  },
  text: {
    minWidth: 0,
    flexShrink: 1,
  },
  customContent: {
    minWidth: 0,
    flexShrink: 1,
  },
  loader: {
    marginLeft: 8,
  },
  icon: {
    marginRight: 8,
  },
  rightIcon: {
    marginLeft: 8,
  },
  disabled: {
    opacity: 0.5,
  },
});
