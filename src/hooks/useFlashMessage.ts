import { useCallback, useEffect, useRef, useState } from 'react';

export type FlashMessage = {
  text: string;
  ok: boolean;
};

export function useFlashMessage(defaultDismissMs = 3000) {
  const [message, setMessage] = useState<FlashMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setMessage(null);
  }, []);

  const show = useCallback(
    (text: string, ok: boolean, dismissMs: number = defaultDismissMs) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setMessage({ text, ok });
      if (dismissMs > 0) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setMessage(null);
        }, dismissMs);
      }
    },
    [defaultDismissMs],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { message, show, clear };
}
