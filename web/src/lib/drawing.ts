// The drawing: 28 x 28 numbers from 0 (empty) to 1 (full ink), row by row.
// It is drawn straight into the 28 x 28 grid, so what the visitor sees is
// exactly what the network gets.

export const GRID = 28;
export const CELLS = GRID * GRID;

/** A point on the pad in cell units: x and y run from 0 to 28, fractions allowed. */
export interface PadPoint {
  x: number;
  y: number;
}

// The brush from the design: full ink within 1.1 cells of the stroke, fading
// to nothing at 2.3 cells.
const BRUSH_FULL = 1.1;
const BRUSH_EDGE = 2.3;

export function blankPixels(): Float32Array {
  return new Float32Array(CELLS);
}

export function isBlank(pixels: ArrayLike<number>): boolean {
  for (let i = 0; i < pixels.length; i++) if (pixels[i] > 0) return false;
  return true;
}

function distanceToSegment(px: number, py: number, a: PadPoint, b: PadPoint): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lengthSquared = vx * vx + vy * vy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / lengthSquared));
  const dx = px - (a.x + t * vx);
  const dy = py - (a.y + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Returns a new drawing with a brush stroke from `from` to `to` added.
 * Pass the same point twice for a single dot. The input is not changed.
 */
export function stampStroke(pixels: Float32Array, from: PadPoint, to: PadPoint): Float32Array {
  const next = new Float32Array(pixels);
  const minX = Math.max(0, Math.floor(Math.min(from.x, to.x) - BRUSH_EDGE - 1));
  const maxX = Math.min(GRID - 1, Math.ceil(Math.max(from.x, to.x) + BRUSH_EDGE));
  const minY = Math.max(0, Math.floor(Math.min(from.y, to.y) - BRUSH_EDGE - 1));
  const maxY = Math.min(GRID - 1, Math.ceil(Math.max(from.y, to.y) + BRUSH_EDGE));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // Measure from the centre of the cell.
      const d = distanceToSegment(x + 0.5, y + 0.5, from, to);
      const ink = d < BRUSH_FULL ? 1 : d < BRUSH_EDGE ? (BRUSH_EDGE - d) / (BRUSH_EDGE - BRUSH_FULL) : 0;
      const index = y * GRID + x;
      if (ink > next[index]) next[index] = ink;
    }
  }
  return next;
}

/** Turns a pointer position into pad cell units, given the pad's box on screen. */
export function pointerToPad(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
): PadPoint {
  const x = ((clientX - box.left) / box.width) * GRID;
  const y = ((clientY - box.top) / box.height) * GRID;
  return { x: Math.max(0, Math.min(GRID, x)), y: Math.max(0, Math.min(GRID, y)) };
}

/**
 * The line of the sample digit 5, in pad cell units: the top bar from right
 * to left, down the stem, then round the bowl. Like a handwritten 5 it sits
 * in the middle 20 x 20 cells, as the MNIST digits do.
 */
const SAMPLE_FIVE: readonly PadPoint[] = [
  { x: 18.5, y: 6 },
  { x: 10.5, y: 6 },
  { x: 10, y: 12.5 },
  { x: 12.5, y: 11.6 },
  { x: 15, y: 11.7 },
  { x: 17.2, y: 12.9 },
  { x: 18.5, y: 15 },
  { x: 18.6, y: 17.5 },
  { x: 17.5, y: 19.8 },
  { x: 15.3, y: 21.4 },
  { x: 12.6, y: 21.9 },
  { x: 9.8, y: 20.8 },
];

/** A neatly drawn 5, made with the same brush as a visitor's drawing. */
export function samplePixels(): Float32Array {
  let pixels = blankPixels();
  for (let i = 1; i < SAMPLE_FIVE.length; i++) pixels = stampStroke(pixels, SAMPLE_FIVE[i - 1], SAMPLE_FIVE[i]);
  return pixels;
}
