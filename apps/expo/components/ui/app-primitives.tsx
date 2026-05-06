import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  colors,
  radius,
  spacing,
  typography,
  surface as surfaceToken,
  border,
  textRoles,
  overlay,
  statusBg,
  text,
} from '../../theme';

type SurfaceTone = 'default' | 'muted' | 'inset' | 'selected' | 'success' | 'warning' | 'danger';
type SurfacePadding = 'none' | 'sm' | 'md' | 'lg';

const paddingMap: Record<SurfacePadding, number> = {
  none: 0,
  sm: spacing.sm + spacing.xs,
  md: spacing.md,
  lg: spacing.lg - spacing.xs,
};

const toneStyles: Record<SurfaceTone, { bg: string; borderColor: string }> = {
  default: { bg: surfaceToken.default, borderColor: border.default },
  muted: { bg: surfaceToken.muted, borderColor: border.subtle },
  inset: { bg: surfaceToken.inset, borderColor: border.subtle },
  selected: { bg: surfaceToken.selected, borderColor: border.default },
  success: { bg: surfaceToken.success, borderColor: statusBg.successBorder },
  warning: { bg: surfaceToken.warning, borderColor: statusBg.warningBorder },
  danger: { bg: surfaceToken.danger, borderColor: statusBg.errorBorder },
};

export interface SurfaceProps {
  tone?: SurfaceTone;
  padding?: SurfacePadding;
  children: ReactNode;
  style?: ViewStyle;
}

export function Surface({ tone = 'default', padding = 'md', style, children }: SurfaceProps) {
  const t = toneStyles[tone];
  return (
    <View
      style={[
        styles.surface,
        {
          backgroundColor: t.bg,
          borderColor: t.borderColor,
          padding: paddingMap[padding],
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  rightSlot,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  rightSlot?: ReactNode;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderContent}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {rightSlot ? rightSlot : null}
    </View>
  );
}

export function SectionTitle({
  title,
  actionLabel,
  onActionPress,
}: {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
}) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText}>{title}</Text>
      {actionLabel && onActionPress ? (
        <Pressable onPress={onActionPress}>
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type BadgeTone = 'neutral' | 'orange' | 'emerald' | 'sky' | 'rose';

const badgeTones: Record<BadgeTone, { border: string; bg: string; text: string }> = {
  neutral: { border: overlay.medium, bg: overlay.subtle, text: colors.textMuted },
  orange: {
    border: statusBg.warningBorder,
    bg: statusBg.warning,
    text: colors.accentSecondary,
  },
  emerald: { border: statusBg.successBorder, bg: statusBg.success, text: colors.success },
  sky: { border: overlay.medium, bg: overlay.subtle, text: colors.sky },
  rose: { border: statusBg.errorBorder, bg: statusBg.error, text: colors.error },
};

export function Badge({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: BadgeTone;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const toneStyle = badgeTones[tone];
  return (
    <View style={[styles.badge, { borderColor: toneStyle.border, backgroundColor: toneStyle.bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={toneStyle.text} /> : null}
      <Text style={[styles.badgeLabel, { color: toneStyle.text }]}>{label}</Text>
    </View>
  );
}

export function MetricTile({
  label,
  value,
  hint,
  tone = 'neutral',
  style,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: BadgeTone;
  style?: ViewStyle;
}) {
  const accentColors: Record<BadgeTone, string> = {
    neutral: colors.text,
    orange: colors.accentSecondary,
    emerald: colors.success,
    sky: colors.sky,
    rose: colors.error,
  };

  return (
    <View style={[styles.metricTile, style]}>
      <Text
        style={styles.metricLabel}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {label}
      </Text>
      <Text style={[styles.metricValue, { color: accentColors[tone] }]}>{value}</Text>
      {hint ? (
        <Text
          style={styles.metricHint}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function ActionButton({
  label,
  icon,
  variant = 'primary',
  onPress,
  disabled,
  testID,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'secondary' | 'ghost';
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const variantStyles = {
    primary: { bg: colors.accent, text: colors.text, iconColor: colors.text },
    secondary: { bg: overlay.subtle, text: colors.text, iconColor: colors.textMuted },
    ghost: { bg: 'transparent', text: colors.textMuted, iconColor: colors.textMuted },
  };

  const v = variantStyles[variant];

  return (
    <Pressable
      testID={testID}
      accessibilityLabel={testID ?? label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor: v.bg },
        pressed && styles.actionButtonPressed,
        disabled && styles.actionButtonDisabled,
      ]}
    >
      {icon ? <Ionicons name={icon} size={16} color={v.iconColor} /> : null}
      <Text style={[styles.actionButtonLabel, { color: v.text }]}>{label}</Text>
    </Pressable>
  );
}

export function SegmentedTabs({
  options,
}: {
  options: Array<{ label: string; active: boolean; onPress: () => void }>;
}) {
  return (
    <View style={styles.segmentedTabs}>
      <View style={styles.segmentedTabsInner}>
        {options.map((option, index) => (
          <Pressable
            key={`segment:${option.label}:${index}`}
            onPress={option.onPress}
            style={[styles.segmentTab, option.active ? styles.segmentTabActive : undefined]}
          >
            <Text
              style={[
                styles.segmentTabLabel,
                option.active ? styles.segmentTabLabelActive : undefined,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  pageHeaderContent: {
    flex: 1,
    gap: spacing.xs,
  },
  eyebrow: {
    fontSize: textRoles.eyebrow.fontSize,
    fontWeight: typography.fontWeights.semibold,
    letterSpacing: 2,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: textRoles.screenTitle.fontSize,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    lineHeight: textRoles.screenTitle.lineHeight,
  },
  description: {
    fontSize: typography.fontSizes.base,
    color: colors.textMuted,
    lineHeight: 24,
  },
  surface: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm + spacing.xs,
  },
  sectionTitleText: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  actionLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.accentSecondary,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.sm + spacing.xs,
    paddingVertical: spacing.xs + 2,
  },
  badgeLabel: {
    fontSize: textRoles.bodySmall.fontSize,
    fontWeight: typography.fontWeights.medium,
  },
  metricTile: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: overlay.muted,
    backgroundColor: overlay.inverseSubtle,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm + spacing.xs,
  },
  metricLabel: {
    fontSize: textRoles.metricLabel.fontSize,
    fontWeight: typography.fontWeights.medium,
    letterSpacing: 0.8,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: textRoles.metricValue.fontSize,
    fontWeight: typography.fontWeights.semibold,
    marginTop: spacing.sm + spacing.xs,
  },
  metricHint: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
  },
  actionButtonPressed: {
    opacity: 0.8,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  segmentedTabs: {
    marginBottom: spacing.lg - spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: overlay.medium,
    backgroundColor: overlay.subtle,
    padding: spacing.xs + 2,
  },
  segmentedTabsInner: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
  },
  segmentTab: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  segmentTabActive: {
    backgroundColor: colors.text,
  },
  segmentTabLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textMuted,
  },
  segmentTabLabelActive: {
    color: text.inverse,
  },
});
