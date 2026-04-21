import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, typography } from '../../theme';

interface CollapsibleProps {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  style?: ViewStyle;
}

export function Collapsible({ label, children, defaultOpen = false, style }: CollapsibleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <View style={style}>
      <Pressable onPress={() => setIsOpen(!isOpen)} style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.chevron}>{isOpen ? '▲' : '▼'}</Text>
      </Pressable>
      {isOpen && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  label: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  chevron: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
  },
  content: {
    marginTop: 8,
  },
});
