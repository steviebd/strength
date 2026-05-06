import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors } from '@/theme';

interface KeyboardFormLayoutProps {
  children: ReactNode;
  keyboardVerticalOffset?: number;
  style?: ViewStyle;
}

export function KeyboardFormLayout({
  children,
  keyboardVerticalOffset = 0,
  style,
}: KeyboardFormLayoutProps) {
  if (Platform.OS === 'web') {
    return <View style={[styles.container, style]}>{children}</View>;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={[styles.container, style]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
