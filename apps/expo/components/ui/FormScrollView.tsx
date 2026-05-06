import React from 'react';
import { Platform, ScrollView, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollProvider } from '@/context/ScrollContext';
import { colors, layout, spacing } from '@/theme';

export interface FormScrollViewProps extends ScrollViewProps {
  bottomInset?: number;
  horizontalPadding?: number;
  topPadding?: number;
}

export const FormScrollView = React.forwardRef<ScrollView, FormScrollViewProps>(
  (
    {
      bottomInset = layout.bottomInsetForm,
      horizontalPadding = layout.screenPadding,
      topPadding = 0,
      contentContainerStyle,
      keyboardDismissMode,
      keyboardShouldPersistTaps = 'handled',
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const insets = useSafeAreaInsets();
    const scrollViewRef = React.useRef<ScrollView>(null);

    React.useImperativeHandle(ref, () => scrollViewRef.current as ScrollView);

    return (
      <ScrollProvider scrollViewRef={scrollViewRef}>
        <ScrollView
          ref={scrollViewRef}
          style={[{ flex: 1, backgroundColor: colors.background }, style]}
          contentContainerStyle={[
            {
              paddingTop: topPadding,
              paddingHorizontal: horizontalPadding,
              paddingBottom: insets.bottom + bottomInset + spacing.md,
            },
            contentContainerStyle,
          ]}
          keyboardDismissMode={
            keyboardDismissMode ?? (Platform.OS === 'ios' ? 'interactive' : 'none')
          }
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          showsVerticalScrollIndicator={false}
          {...props}
        >
          {children}
        </ScrollView>
      </ScrollProvider>
    );
  },
);

FormScrollView.displayName = 'FormScrollView';
