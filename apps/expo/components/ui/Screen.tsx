import React from 'react';
import { type ScrollViewProps, type ViewProps, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout } from '@/theme';

/**
 * Screen - Base container with safe area background color
 */
interface ScreenProps extends ViewProps {}

export function Screen({ style, ...props }: ScreenProps) {
  return <View style={[{ flex: 1, backgroundColor: colors.background }, style]} {...props} />;
}

/**
 * ScreenScrollView - ScrollView with consistent safe area padding
 *
 * @param bottomInset - Extra bottom padding (default: 120)
 * @param horizontalPadding - Horizontal padding (default: layout.screenPadding = 20)
 * @param topPadding - Top padding for status bar gap (default: 0)
 */
export interface ScreenScrollViewProps extends ScrollViewProps {
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
      style,
      contentContainerStyle,
      ...props
    },
    ref,
  ) => {
    const insets = useSafeAreaInsets();
    return (
      <ScrollView
        ref={ref}
        style={[{ flex: 1, backgroundColor: colors.background }, style]}
        contentContainerStyle={[
          {
            paddingTop: topPadding,
            paddingHorizontal: horizontalPadding,
            paddingBottom: insets.bottom + bottomInset,
          },
          contentContainerStyle,
        ]}
        showsVerticalScrollIndicator={false}
        {...props}
      />
    );
  },
);
ScreenScrollView.displayName = 'ScreenScrollView';
