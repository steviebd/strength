import { createContext, useContext, type ReactNode, type RefObject } from 'react';
import { findNodeHandle, UIManager } from 'react-native';
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
  topInset?: number;
}

export function ScrollProvider({ children, scrollViewRef, topInset = 0 }: ScrollProviderProps) {
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

    const inputNodeHandle = findNodeHandle(inputNode);
    const innerNodeHandle = findNodeHandle(innerNode);

    if (!inputNodeHandle || !innerNodeHandle) {
      if (retry) {
        setTimeout(() => measureAndScroll(inputRef, offset, false), 80);
      }
      return;
    }

    UIManager.measureLayout(
      inputNodeHandle,
      innerNodeHandle,
      () => {
        if (retry) {
          setTimeout(() => measureAndScroll(inputRef, offset, false), 80);
        }
      },
      (_x: number, y: number) => {
        scrollView.scrollTo({
          y: Math.max(0, y - offset - topInset),
          animated: true,
        });
      },
    );
  }

  function scrollToInput(inputRef: RefObject<any>, offset = 80) {
    measureAndScroll(inputRef, offset);
  }

  return <ScrollContext.Provider value={{ scrollToInput }}>{children}</ScrollContext.Provider>;
}
