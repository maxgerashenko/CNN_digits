import { useEffect, useState, type RefObject } from 'react';

/** The spinner is fully visible after this much pull, in px. */
export const PULL_VISIBLE = 56;
/** Letting go after this much pull, in px, reloads the app. */
export const PULL_RELOAD = 64;

/** Touches that begin on these do not start a pull: the drawing pad, sliders. */
const IGNORE = 'input, [data-no-pull]';

export interface PullState {
  /** Height of the spinner area in px. */
  height: number;
  /** 0 to 1: how visible the spinner is. */
  progress: number;
  /** True once the reload has started. */
  reloading: boolean;
}

const CLOSED: PullState = { height: 0, progress: 0, reloading: false };

/**
 * Phone: pulling the element down while it is scrolled to its top opens a
 * spinner. Letting go after PULL_RELOAD px calls `reload` (default: reload
 * the page); letting go earlier closes the spinner.
 */
export function usePullToReload(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  reload: () => void = () => window.location.reload(),
): PullState {
  const [state, setState] = useState<PullState>(CLOSED);

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let pull = 0;

    const onStart = (event: TouchEvent) => {
      const target = event.target as Element | null;
      tracking = event.touches.length === 1 && element.scrollTop <= 0 && !target?.closest(IGNORE);
      pull = 0;
      if (!tracking) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    };

    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const dx = event.touches[0].clientX - startX;
      const dy = event.touches[0].clientY - startY;
      if (pull === 0 && (dy <= 0 || Math.abs(dx) > Math.abs(dy) || element.scrollTop > 0)) {
        if (dy < 0 || Math.abs(dx) > 12) tracking = false;
        return;
      }
      // The spinner moves half as far as the finger.
      pull = Math.max(0, dy / 2);
      if (event.cancelable) event.preventDefault();
      setState({ height: Math.min(pull, PULL_RELOAD + 16), progress: Math.min(1, pull / PULL_VISIBLE), reloading: false });
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (pull >= PULL_RELOAD) {
        setState({ height: PULL_RELOAD, progress: 1, reloading: true });
        reload();
      } else {
        setState(CLOSED);
      }
      pull = 0;
    };

    element.addEventListener('touchstart', onStart, { passive: true });
    element.addEventListener('touchmove', onMove, { passive: false });
    element.addEventListener('touchend', onEnd);
    element.addEventListener('touchcancel', onEnd);
    return () => {
      element.removeEventListener('touchstart', onStart);
      element.removeEventListener('touchmove', onMove);
      element.removeEventListener('touchend', onEnd);
      element.removeEventListener('touchcancel', onEnd);
    };
    // `reload` is left out: callers pass a new function on every render.
  }, [ref, enabled]);

  return state;
}
