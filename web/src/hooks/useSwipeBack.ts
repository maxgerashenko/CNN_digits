import { useEffect, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * How far the screen follows the finger, in px: the same stop as pull to
 * reload. The screen moves with the finger, so a 40px swipe reaches the stop.
 * Letting go at the stop goes back; letting go earlier springs back.
 */
export const SWIPE_FOLLOW_MAX = 40;

/**
 * Safari on an iPhone has its own swipe from the left edge that slides the
 * whole page away. A touch that begins this close to the edge, in px, is
 * taken from the browser so that only the app's swipe runs.
 */
export const EDGE_WIDTH = 16;

/** Touches that begin on these do not start a swipe: sliders, and anything that asks for it. */
const IGNORE = 'input, [data-no-swipe]';

/**
 * Phone: a swipe to the right on the element opens `backTo`. The element
 * follows the finger up to SWIPE_FOLLOW_MAX. Does nothing when `backTo` is undefined.
 */
export function useSwipeBack(ref: RefObject<HTMLElement | null>, backTo: string | undefined): void {
  const navigate = useNavigate();

  useEffect(() => {
    const element = ref.current;
    if (!element || backTo === undefined) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let swiping = false;
    let travel = 0;

    const settle = () => {
      element.style.transition = 'transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1)';
      element.style.transform = '';
    };

    const onStart = (event: TouchEvent) => {
      const target = event.target as Element | null;
      tracking = event.touches.length === 1 && !target?.closest(IGNORE);
      swiping = false;
      travel = 0;
      if (!tracking) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      if (startX < EDGE_WIDTH && event.cancelable) event.preventDefault();
    };

    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const dx = event.touches[0].clientX - startX;
      const dy = event.touches[0].clientY - startY;
      if (!swiping) {
        // Mostly sideways and to the right: a swipe. Mostly up or down: a scroll.
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) tracking = false;
        else if (dx > 12 && dx > Math.abs(dy) * 1.5) swiping = true;
        if (!swiping) return;
      }
      travel = Math.max(0, Math.min(SWIPE_FOLLOW_MAX, dx));
      element.style.transition = 'none';
      element.style.transform = `translateX(${travel}px)`;
    };

    const onEnd = () => {
      if (!swiping) return;
      const back = travel >= SWIPE_FOLLOW_MAX;
      tracking = false;
      swiping = false;
      settle();
      if (back) navigate(backTo);
    };

    element.addEventListener('touchstart', onStart, { passive: false });
    element.addEventListener('touchmove', onMove, { passive: true });
    element.addEventListener('touchend', onEnd);
    element.addEventListener('touchcancel', settle);
    return () => {
      element.removeEventListener('touchstart', onStart);
      element.removeEventListener('touchmove', onMove);
      element.removeEventListener('touchend', onEnd);
      element.removeEventListener('touchcancel', settle);
      element.style.transition = '';
      element.style.transform = '';
    };
  }, [ref, backTo, navigate]);
}
