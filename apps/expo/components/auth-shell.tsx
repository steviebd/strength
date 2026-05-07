import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormScrollView } from '@/components/ui/FormScrollView';
import { colors, spacing, textRoles, radius, layout } from '@/theme';

interface AuthShellProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AuthShell({ eyebrow, title, subtitle, children }: AuthShellProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FormScrollView horizontalPadding={0} bottomInset={spacing.xl}>
        <View
          style={{
            paddingHorizontal: layout.screenPadding,
            paddingTop: Math.max(insets.top, spacing.xl),
            paddingBottom: spacing.xl,
          }}
        >
          <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
            <View
              style={{
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
              }}
            >
              <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>S</Text>
            </View>
            <Text style={{ ...textRoles.eyebrow, color: colors.textMuted }}>{eyebrow}</Text>
          </View>

          <View
            style={{
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
            }}
          >
            <View style={{ marginBottom: spacing.lg }}>
              <Text style={{ ...textRoles.screenTitle, color: colors.text }}>{title}</Text>
              <Text
                style={{
                  ...textRoles.screenSubtitle,
                  color: colors.textMuted,
                  marginTop: spacing.sm,
                }}
              >
                {subtitle}
              </Text>
            </View>
            {children}
          </View>
        </View>
      </FormScrollView>
    </View>
  );
}
