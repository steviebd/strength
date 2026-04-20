import { useRef, useState, useCallback } from 'react';

type SaveStatus = 'idle' | 'saving' | 'saved';

export function useAutoSave<T extends (...args: any[]) => Promise<void>>(
  saveFn: T,
  delay: number = 1500,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const save = useCallback(async () => {
    clearTimer();
    setStatus('saving');
    try {
      await saveFn();
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('idle');
    }
  }, [saveFn, clearTimer]);

  const scheduleSave = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      save();
    }, delay);
  }, [delay, clearTimer, save]);

  return {
    scheduleSave,
    save,
    status,
  };
}
