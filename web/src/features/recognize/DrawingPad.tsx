import { useRef, type PointerEvent } from 'react';

import { PixelGrid, TrashIcon } from '../../components/ui';
import { cx } from '../../lib/cx';
import { pointerToPad, type PadPoint } from '../../lib/drawing';
import { useDrawingStore } from '../../state/drawingStore';
import styles from './DrawingPad.module.css';

export interface DrawingPadProps {
  className?: string;
}

/** The square 28 x 28 pad. Mouse, touch and pen paint straight into the grid the network reads. */
export function DrawingPad({ className }: DrawingPadProps) {
  const pixels = useDrawingStore((s) => s.pixels);
  const blank = useDrawingStore((s) => s.blank);
  const stroke = useDrawingStore((s) => s.stroke);
  const clear = useDrawingStore((s) => s.clear);
  const surface = useRef<HTMLDivElement>(null);
  const last = useRef<PadPoint | null>(null);
  const activeId = useRef<number | null>(null);

  const pointAt = (event: PointerEvent<HTMLDivElement>): PadPoint => {
    const box = surface.current!.getBoundingClientRect();
    return pointerToPad(event.clientX, event.clientY, box);
  };

  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (activeId.current !== null && activeId.current !== event.pointerId) return;
    event.preventDefault();
    activeId.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = pointAt(event);
    last.current = point;
    stroke(point, point);
  };

  const inside = (event: PointerEvent<HTMLDivElement>): boolean => {
    const box = surface.current!.getBoundingClientRect();
    return (
      event.clientX >= box.left &&
      event.clientX <= box.left + box.width &&
      event.clientY >= box.top &&
      event.clientY <= box.top + box.height
    );
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== activeId.current) return;
    const from = last.current;
    const point = pointAt(event);
    if (!inside(event)) {
      // Leaving the pad: finish the line at the edge, then stop until the pointer is back inside.
      if (from) stroke(from, point);
      last.current = null;
      return;
    }
    // Coming back in: start a new segment instead of joining across the border.
    last.current = point;
    stroke(from ?? point, point);
  };

  const up = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== activeId.current) return;
    activeId.current = null;
    last.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <div className={cx(styles.wrap, className)}>
      <div
        ref={surface}
        className={styles.surface}
        data-testid="drawing-surface"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onLostPointerCapture={up}
      >
        <PixelGrid
          data={pixels}
          size={28}
          lines
          label={blank ? 'Drawing pad, 28 by 28 cells, empty' : 'Drawing pad, 28 by 28 cells, with your drawing'}
          className={styles.grid}
        />
      </div>
      <button type="button" aria-label="Clear drawing" className={styles.clear} onClick={clear}>
        <TrashIcon />
      </button>
      <span className={styles.size} aria-hidden="true">
        28 × 28
      </span>
    </div>
  );
}
