import React from 'react';
import { type ScrollViewProps, type ViewProps, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout } from '@/theme';

interface ScreenProps extends ViewProps {}

export function Screen({ style, ...props }: ScreenProps) {
  return <View style={[{ flex: 1, backgroundColor: colors.background }, style]} {...props} />;
}

interface ScreenScrollViewProps extends ScrollViewProps {
  bottomInset?: number;
  horizontalPadding?: number;
  topPadding?: number;
}

export const ScreenScrollView = React.forwardRef<any, ScreenScrollViewProps>(
  (
    {
      bottomInset = 120,
      horizontalPadding = layout.screenPadding,
      topPadding = 0,
      style: _style,
      ...props
    },
    ref,
  ) => {
    const insets = useSafeAreaInsets();
    return (
      <ScrollView
        ref={ref}
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          paddingTop: topPadding,
          paddingHorizontal: horizontalPadding,
          paddingBottom: insets.bottom + bottomInset,
        }}
        showsVerticalScrollIndicator={false}
        {...props}
      />
    );
  },
);
ScreenScrollView.displayName = 'ScreenScrollView';
