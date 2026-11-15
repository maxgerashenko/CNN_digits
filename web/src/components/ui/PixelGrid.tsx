import { useEffect, useRef } from 'react';

import { cx } from '../../lib/cx';
import { GRID_LINE, rampColor, type RampName } from '../../lib/ramp';
import styles from './PixelGrid.module.css';

export interface PixelGridProps {
  /** size * size values, row by row. Null draws an empty (dark) grid. */
  data: ArrayLike<number> | null;
  /** Cells per side: 28 for the drawing, 14, 7 or 3 for feature maps. */
  size: number;
  /** 'ink' = dark to white (the drawing). 'violet' = dark to violet (feature maps). */
  ramp?: RampName;
  /** Scale the values so the largest one is the brightest. Use for feature maps. */
  normalize?: boolean;
  /** Draw thin lines between the cells, as on the drawing pad. */
  lines?: boolean;
  /** What the picture shows, for screen readers. */
  label: string;
  className?: string;
}

// With lines, every cell is drawn CELL pixels wide with a 1 pixel line around it.
const CELL = 12;

/**
 * A square picture made of cells, drawn on a canvas. It fills the width of
 * its container and stays square. Used for the drawing pad, the input
 * thumbnail and every feature map.
 */
export function PixelGrid({ data, size, ramp = 'ink', normalize = false, lines = false, label, className }: PixelGridProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const side = lines ? size * (CELL + 1) + 1 : size;

  useEffect(() => {
    const context = ref.current?.getContext('2d');
    if (!context) return;

    let top = 1;
    if (normalize && data) {
      top = 0;
      for (let i = 0; i < data.length; i++) if (data[i] > top) top = data[i];
      if (top <= 0) top = 1;
    }

    const image = context.createImageData(side, side);
    const put = (x: number, y: number, r: number, g: number, b: number) => {
      const at = (y * side + x) * 4;
      image.data[at] = r;
      image.data[at + 1] = g;
      image.data[at + 2] = b;
      image.data[at + 3] = 255;
    };

    if (lines) {
      for (let i = 0; i < side * side; i++) put(i % side, Math.floor(i / side), GRID_LINE[0], GRID_LINE[1], GRID_LINE[2]);
    }
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const value = data ? data[row * size + col] / top : 0;
        const [r, g, b] = rampColor(value, ramp);
        if (!lines) {
          put(col, row, r, g, b);
          continue;
        }
        const left = 1 + col * (CELL + 1);
        const upper = 1 + row * (CELL + 1);
        for (let y = upper; y < upper + CELL; y++) for (let x = left; x < left + CELL; x++) put(x, y, r, g, b);
      }
    }
    context.putImageData(image, 0, 0);
  }, [data, size, ramp, normalize, lines, side]);

  return <canvas ref={ref} role="img" aria-label={label} width={side} height={side} className={cx(styles.grid, !lines && styles.pixelated, className)} />;
}
