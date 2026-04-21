import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme';

type BadgeTone = 'neutral' | 'orange' | 'emerald' | 'sky' | 'rose';

const badgeTones: Record<BadgeTone, { border: string; bg: string; text: string }> = {
  neutral: { border: 'rgba(255,255,255,0.1)', bg: 'rgba(255,255,255,0.05)', text: '#94a3b8' },
  orange: { border: 'rgba(251,146,60,0.2)', bg: 'rgba(251,146,60,0.1)', text: '#fb923c' },
  emerald: { border: 'rgba(34,197,94,0.2)', bg: 'rgba(34,197,94,0.1)', text: '#6ee7b7' },
  sky: { border: 'rgba(56,189,248,0.2)', bg: 'rgba(56,189,248,0.1)', text: '#7dd3fc' },
  rose: { border: 'rgba(251,113,133,0.2)', bg: 'rgba(251,113,133,0.1)', text: '#fda4af' },
};

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

export function Surface({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.surface, style]}>{children}</View>;
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
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: BadgeTone;
}) {
  const accentColors: Record<BadgeTone, string> = {
    neutral: colors.text,
    orange: '#fb923c',
    emerald: '#6ee7b7',
    sky: '#7dd3fc',
    rose: '#fda4af',
  };

  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: accentColors[tone] }]}>{value}</Text>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
    </View>
  );
}

export function ActionButton({
  label,
  icon,
  variant = 'primary',
  onPress,
  disabled,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'secondary' | 'ghost';
  onPress?: () => void;
  disabled?: boolean;
}) {
  const variantStyles = {
    primary: { bg: colors.accent, text: '#ffffff', iconColor: '#ffffff' },
    secondary: { bg: 'rgba(255,255,255,0.05)', text: colors.text, iconColor: '#94a3b8' },
    ghost: { bg: 'transparent', text: '#94a3b8', iconColor: '#94a3b8' },
  };

  const v = variantStyles[variant];

  return (
    <Pressable
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
        {options.map((option) => (
          <Pressable
            key={option.label}
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
    marginBottom: 24,
  },
  pageHeaderContent: {
    flex: 1,
    gap: spacing.xs,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: typography.fontWeights.semibold,
    letterSpacing: 2,
    color: '#64748b',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    lineHeight: 28,
  },
  description: {
    fontSize: typography.fontSizes.base,
    color: '#94a3b8',
    lineHeight: 24,
  },
  surface: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(24,24,27,0.8)',
    padding: 20,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitleText: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  actionLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: '#fb923c',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: typography.fontWeights.medium,
  },
  metricTile: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: 16,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: typography.fontWeights.medium,
    letterSpacing: 1.6,
    color: '#64748b',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: typography.fontWeights.semibold,
    marginTop: 12,
  },
  metricHint: {
    fontSize: typography.fontSizes.sm,
    color: '#94a3b8',
    marginTop: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
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
    marginBottom: 20,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 6,
  },
  segmentedTabsInner: {
    flexDirection: 'row',
    gap: 6,
  },
  segmentTab: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  segmentTabActive: {
    backgroundColor: colors.text,
  },
  segmentTabLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: '#94a3b8',
  },
  segmentTabLabelActive: {
    color: '#0a0a0a',
  },
});
