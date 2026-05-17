import { createContext, useContext, type ReactNode, type RefObject } from 'react';
import { findNodeHandle, Platform, UIManager } from 'react-native';
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
  function measureAndScrollWeb(inputRef: RefObject<any>, offset: number, retry = true) {
    const inputNode = inputRef?.current;
    const scrollView = scrollViewRef?.current as any;
    const scrollNode =
      typeof scrollView?.getScrollableNode === 'function' ? scrollView.getScrollableNode() : null;
    const inputElement =
      inputNode && typeof inputNode.getBoundingClientRect === 'function'
        ? inputNode
        : inputNode?._node;

    if (
      !inputElement ||
      !scrollNode ||
      typeof inputElement.getBoundingClientRect !== 'function' ||
      typeof scrollNode.getBoundingClientRect !== 'function'
    ) {
      if (retry) {
        setTimeout(() => measureAndScrollWeb(inputRef, offset, false), 80);
      }
      return;
    }

    const inputRect = inputElement.getBoundingClientRect();
    const scrollRect = scrollNode.getBoundingClientRect();
    const scrollTop = Number(scrollNode.scrollTop ?? 0);
    const y = Math.max(0, inputRect.top - scrollRect.top + scrollTop - offset - topInset);

    if (typeof scrollNode.scrollTo === 'function') {
      scrollNode.scrollTo({ top: y, behavior: 'smooth' });
      return;
    }

    if (typeof scrollView?.scrollTo === 'function') {
      scrollView.scrollTo({ y, animated: true });
    }
  }

  function measureAndScroll(inputRef: RefObject<any>, offset: number, retry = true) {
    if (Platform.OS === 'web') {
      measureAndScrollWeb(inputRef, offset, retry);
      return;
    }

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

  function scrollToInput(inputRef: RefObject<any>, offset = 60) {
    measureAndScroll(inputRef, offset);
  }

  return <ScrollContext.Provider value={{ scrollToInput }}>{children}</ScrollContext.Provider>;
}
