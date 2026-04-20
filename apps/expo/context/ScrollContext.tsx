import { createContext, useContext, type ReactNode, type RefObject } from 'react';
import type { ScrollView } from 'react-native';

export interface ScrollContextValue {
  scrollToInput: (inputRef: RefObject<any>) => void;
}

export const ScrollContext = createContext<ScrollContextValue | null>(null);

export function useScrollToInput(): (inputRef: RefObject<any>) => void {
  const ctx = useContext(ScrollContext);
  if (!ctx) {
    return () => {};
  }
  return ctx.scrollToInput;
}

interface ScrollProviderProps {
  children: ReactNode;
  scrollViewRef: RefObject<ScrollView>;
}

const KEYBOARD_HEIGHT = 300;
const TOP_OFFSET = 100;

export function ScrollProvider({ children, scrollViewRef }: ScrollProviderProps) {
  function scrollToInput(inputRef: RefObject<any>) {
    if (inputRef?.current && scrollViewRef?.current) {
      inputRef.current.measure(
        (x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
          const targetY = pageY - KEYBOARD_HEIGHT - TOP_OFFSET;
          scrollViewRef.current?.scrollTo({
            y: Math.max(0, targetY),
            animated: true,
          });
        },
      );
    }
  }

  return <ScrollContext.Provider value={{ scrollToInput }}>{children}</ScrollContext.Provider>;
}
