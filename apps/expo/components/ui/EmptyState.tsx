import { type ReactNode } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, textRoles, spacing } from '@/theme';

type EmptyStateType = 'empty' | 'loading' | 'error';

interface EmptyStateProps {
  type?: EmptyStateType;
  title?: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  action?: ReactNode;
}

const iconMap: Record<EmptyStateType, keyof typeof Ionicons.glyphMap> = {
  empty: 'folder-open-outline',
  loading: 'sync-outline',
  error: 'alert-circle-outline',
};

const defaultMessages: Record<EmptyStateType, { title: string; message: string }> = {
  empty: {
    title: 'Nothing here yet',
    message: 'Start by adding something to get going.',
  },
  loading: {
    title: 'Loading...',
    message: 'Please wait while we fetch your data.',
  },
  error: {
    title: 'Something went wrong',
    message: 'An error occurred. Please try again.',
  },
};

export function EmptyState({ type = 'empty', title, message, icon, action }: EmptyStateProps) {
  const defaults = defaultMessages[type];
  const resolvedTitle = title ?? defaults.title;
  const resolvedMessage = message ?? defaults.message;
  const resolvedIcon = icon ?? iconMap[type];

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name={resolvedIcon} size={40} color={colors.textMuted} />
        {type === 'loading' && (
          <ActivityIndicator size="small" color={colors.textMuted} style={styles.loader} />
        )}
      </View>
      <Text style={styles.title}>{resolvedTitle}</Text>
      <Text style={styles.message}>{resolvedMessage}</Text>
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  loader: {
    position: 'absolute',
    bottom: -4,
    right: -4,
  },
  title: {
    ...textRoles.cardTitle,
    color: colors.text,
    textAlign: 'center',
  },
  message: {
    ...textRoles.bodySmall,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 260,
  },
  action: {
    marginTop: spacing.md,
  },
});
