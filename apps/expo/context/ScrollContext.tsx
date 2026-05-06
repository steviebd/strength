import { createContext, useContext, type ReactNode, type RefObject } from 'react';
import type { ScrollView } from 'react-native';

interface ScrollContextValue {
  scrollToInput: (inputRef: RefObject<any>, offset?: number) => void;
}

const ScrollContext = createContext<ScrollContextValue | null>(null);

export function useScrollToInput(): (inputRef: RefObject<any>, offset?: number) => void {
  const ctx = useContext(ScrollContext);
  if (!ctx) {
    return () => {};
  }
  return ctx.scrollToInput;
}

interface ScrollProviderProps {
  children: ReactNode;
  scrollViewRef: RefObject<ScrollView | null>;
}

export function ScrollProvider({ children, scrollViewRef }: ScrollProviderProps) {
  function measureAndScroll(inputRef: RefObject<any>, offset: number, retry = true) {
    const inputNode = inputRef?.current;
    const scrollView = scrollViewRef?.current;
    const innerNode =
      typeof (scrollView as any)?.getInnerViewNode === 'function'
        ? (scrollView as any).getInnerViewNode()
        : null;

    if (!inputNode || !scrollView || !innerNode) {
      if (retry) {
        setTimeout(() => measureAndScroll(inputRef, offset, false), 80);
      }
      return;
    }

    if (typeof inputNode.measureLayout !== 'function') {
      if (retry) {
        setTimeout(() => measureAndScroll(inputRef, offset, false), 80);
      }
      return;
    }

    inputNode.measureLayout(
      innerNode,
      (_x: number, y: number) => {
        scrollView.scrollTo({
          y: Math.max(0, y - offset),
          animated: true,
        });
      },
      () => {
        if (retry) {
          setTimeout(() => measureAndScroll(inputRef, offset, false), 80);
        }
      },
    );
  }

  function scrollToInput(inputRef: RefObject<any>, offset = 80) {
    measureAndScroll(inputRef, offset);
  }

  return <ScrollContext.Provider value={{ scrollToInput }}>{children}</ScrollContext.Provider>;
}
