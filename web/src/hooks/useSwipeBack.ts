import { useEffect, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';

/** How far the screen follows the finger, in px. */
export const SWIPE_FOLLOW_MAX = 20;
/** A swipe to the right longer than this, in px, goes back. A shorter one springs back. */
export const SWIPE_BACK_DISTANCE = 60;

/** Touches that begin on these do not start a swipe: sliders, and anything that asks for it. */
const IGNORE = 'input, [data-no-swipe]';

/**
 * Phone: a swipe to the right on the element opens `backTo`. The element
 * follows the finger a little. Does nothing when `backTo` is undefined.
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
      element.style.transition = 'transform 180ms ease-out';
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
      travel = dx;
      element.style.transition = 'none';
      element.style.transform = `translateX(${Math.max(0, Math.min(SWIPE_FOLLOW_MAX, dx / 3))}px)`;
    };

    const onEnd = () => {
      if (!swiping) return;
      const back = travel > SWIPE_BACK_DISTANCE;
      tracking = false;
      swiping = false;
      settle();
      if (back) navigate(backTo);
    };

    element.addEventListener('touchstart', onStart, { passive: true });
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
