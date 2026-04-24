import { type ReactNode } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';

interface ButtonGroupProps {
  children: ReactNode;
  direction?: 'row' | 'column';
  style?: ViewStyle;
}

export function ButtonGroup({ children, direction = 'row', style }: ButtonGroupProps) {
  return (
    <View style={[styles.group, direction === 'column' && styles.column, style]}>
      {Array.isArray(children)
        ? children.map((child, index) => (
            <View
              key={`btn-group-${index}`}
              style={direction === 'row' ? styles.rowChild : undefined}
            >
              {child}
            </View>
          ))
        : children}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    gap: 12,
  },
  column: {
    flexDirection: 'column',
  },
  rowChild: {
    flex: 1,
    minWidth: 0,
  },
});
