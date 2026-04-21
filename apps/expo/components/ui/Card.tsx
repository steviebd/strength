import React from 'react';
import { View, StyleSheet, type ViewProps } from 'react-native';
import { colors, radius, layout } from '@/theme';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  interactive?: boolean;
}

export function Card({ children, interactive: _interactive = false, style, ...props }: CardProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: layout.cardPadding,
    overflow: 'hidden',
  },
});
