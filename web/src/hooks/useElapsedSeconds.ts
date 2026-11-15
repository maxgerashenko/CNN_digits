import { useEffect, useState } from 'react';

/**
 * Whole seconds since `startedAt` (milliseconds, Date.now), counted up once
 * a second while `running` is true. 0 when `startedAt` is null.
 */
export function useElapsedSeconds(startedAt: number | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null || !running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt, running]);

  return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
}
