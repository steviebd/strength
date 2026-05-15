import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, ScrollView, type ScrollViewProps } from 'react-native';
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
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    useEffect(() => {
      const isIOS = Platform.OS === 'ios';
      const showEvent = isIOS ? 'keyboardWillShow' : 'keyboardDidShow';
      const hideEvent = isIOS ? 'keyboardWillHide' : 'keyboardDidHide';

      const showSub = Keyboard.addListener(showEvent, (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      });
      const hideSub = Keyboard.addListener(hideEvent, () => {
        setKeyboardHeight(0);
      });

      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }, []);

    React.useImperativeHandle(ref, () => scrollViewRef.current as ScrollView);

    return (
      <ScrollProvider scrollViewRef={scrollViewRef} topInset={topPadding} keyboardHeight={keyboardHeight}>
        <ScrollView
          ref={scrollViewRef}
          style={[{ flex: 1, backgroundColor: colors.background }, style]}
          contentContainerStyle={[
            {
              paddingTop: topPadding,
              paddingHorizontal: horizontalPadding,
              paddingBottom: insets.bottom + bottomInset + spacing.md + keyboardHeight,
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
