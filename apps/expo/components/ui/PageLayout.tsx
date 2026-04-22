import { type ReactNode, type RefObject } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '@/theme';
import { Screen, ScreenScrollView, type ScreenScrollViewProps } from './Screen';

interface PageLayoutProps {
  children: ReactNode;
  header?: ReactNode;
  headerType?: 'standard' | 'custom' | 'none';
  headerSafeArea?: 'layout' | 'header';
  scrollViewRef?: RefObject<ScrollView | null>;
  screenScrollViewProps?: Partial<Omit<ScreenScrollViewProps, 'ref'>>;
}

export function PageLayout({
  children,
  header,
  headerType = 'standard',
  headerSafeArea = 'layout',
  scrollViewRef,
  screenScrollViewProps,
}: PageLayoutProps) {
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <ScreenScrollView
        ref={scrollViewRef}
        topPadding={headerSafeArea === 'layout' ? insets.top + spacing.md : 0}
        bottomInset={120}
        horizontalPadding={20}
        {...screenScrollViewProps}
      >
        {headerType !== 'none' && header}
        {children}
      </ScreenScrollView>
    </Screen>
  );
}
