import React from 'react';
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
    const [keyboardHeight, setKeyboardHeight] = React.useState(0);

    React.useImperativeHandle(ref, () => scrollViewRef.current as ScrollView);

    React.useEffect(() => {
      const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
      const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

      const showSubscription = Keyboard.addListener(showEvent, (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      });
      const hideSubscription = Keyboard.addListener(hideEvent, () => {
        setKeyboardHeight(0);
      });

      return () => {
        showSubscription.remove();
        hideSubscription.remove();
      };
    }, []);

    return (
      <ScrollProvider scrollViewRef={scrollViewRef} topInset={topPadding}>
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
