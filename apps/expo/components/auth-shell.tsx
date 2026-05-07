import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormScrollView } from '@/components/ui/FormScrollView';
import { colors, spacing, textRoles, radius, typography, layout } from '@/theme';

interface AuthShellProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AuthShell({ eyebrow, title, subtitle, children }: AuthShellProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <FormScrollView horizontalPadding={0} bottomInset={spacing.xl}>
        <View
          style={[
            styles.inner,
            {
              paddingTop: Math.max(insets.top, spacing.xl),
            },
          ]}
        >
          <View style={styles.headerGroup}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>S</Text>
            </View>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.titleGroup}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            {children}
          </View>
        </View>
      </FormScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xl,
  },
  headerGroup: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoText: {
    fontSize: textRoles.screenTitle.fontSize,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  eyebrow: {
    ...textRoles.eyebrow,
    color: colors.textMuted,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  titleGroup: {
    marginBottom: spacing.lg,
  },
  title: {
    ...textRoles.screenTitle,
    color: colors.text,
  },
  subtitle: {
    ...textRoles.screenSubtitle,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
});
