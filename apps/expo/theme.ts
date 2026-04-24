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

export const background = {
  app: '#0a0a0a',
  elevated: '#1c1c1f',
  subtle: '#27272a',
  inset: '#0d0d0e',
};

export const surface = {
  default: '#18181b',
  muted: '#27272a',
  raised: '#1c1c1f',
  selected: '#2a2a2e',
  inset: '#0d0d0e',
  danger: 'rgba(239,68,68,0.12)',
  success: 'rgba(34,197,94,0.12)',
  warning: 'rgba(245,158,11,0.12)',
};

export const border = {
  default: '#3f3f46',
  subtle: '#27272a',
  strong: '#52525b',
  focus: '#ef6f4f',
  danger: 'rgba(239,68,68,0.5)',
  success: 'rgba(34,197,94,0.5)',
};

export const text = {
  primary: '#fafafa',
  secondary: '#a1a1aa',
  tertiary: '#71717a',
  inverse: '#0a0a0a',
  danger: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
};

export const accent = {
  primary: '#ef6f4f',
  primaryPressed: '#d95f45',
  secondary: '#fb923c',
  subtle: 'rgba(239,111,79,0.12)',
};

export const status = {
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#7dd3fc',
  neutral: '#71717a',
};

export const chart = {
  blue: '#3b82f6',
  purple: '#8b5cf6',
  gray: '#6b7280',
  orange: '#f97316',
  green: '#22c55e',
  red: '#ef4444',
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

export const textRoles = {
  display: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700' as const,
  },
  screenTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '600' as const,
  },
  screenSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600' as const,
  },
  cardTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
  },
  bodySmall: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as const,
  },
  caption: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '400' as const,
  },
  eyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600' as const,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
  },
  button: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  buttonSmall: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  metricValue: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600' as const,
  },
  metricLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500' as const,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
  },
  input: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400' as const,
  },
};

export const layout = {
  screenPadding: 20,
  screenPaddingCompact: 16,
  cardPadding: 20,
  cardPaddingCompact: 16,
  sectionGap: 24,
  rowGap: 12,
  controlHeight: 48,
  controlHeightSmall: 40,
  minTouchTarget: 44,
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
