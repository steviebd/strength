import { StyleSheet } from 'react-native';

export const colors = {
  background: '#0a0a0a',
  surface: '#18181b',
  surfaceAlt: '#27272a',
  border: '#3f3f46',
  text: '#fafafa',
  textMuted: '#a1a1aa',
  placeholderText: '#71717a',
  accent: '#ef6f4f',
  accentSecondary: '#fb923c',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  sky: '#7dd3fc',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  full: 9999,
};

export const typography = {
  fontSizes: {
    xs: 11,
    sm: 13,
    base: 15,
    lg: 17,
    xl: 20,
    xxl: 28,
    xxxl: 34,
  },
  fontWeights: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

export const layout = {
  screenPadding: 20,
  cardPadding: 20,
  sectionGap: 24,
};

export const globalStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: layout.cardPadding,
    borderWidth: 1,
    borderColor: colors.border,
  },
  screenPadding: {
    paddingHorizontal: layout.screenPadding,
  },
  baseText: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.normal,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.normal,
  },
});
