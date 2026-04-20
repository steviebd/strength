import { useState, useCallback } from 'react';

interface UndoState<T> {
  past: T[];
  present: T;
  future: T[];
}

export function useUndo<T>(initialState: T, maxHistory: number = 20) {
  const [history, setHistory] = useState<UndoState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const pushState = useCallback(
    (newState: T) => {
      setHistory((prev) => ({
        past: [...prev.past, prev.present].slice(-maxHistory),
        present: newState,
        future: [],
      }));
    },
    [maxHistory],
  );

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, -1);
      return {
        past: newPast,
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      const newFuture = prev.future.slice(1);
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);

  return {
    past: history.past,
    present: history.present,
    future: history.future,
    push: pushState,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
