// Colours of the pixel pictures (drawing pad, input thumbnail, feature
// maps). A canvas cannot read CSS variables cheaply, so the three colours
// are repeated here. Keep them equal to --ramp-dark, --ramp-ink and
// --ramp-violet in styles/tokens.css.

export type Rgb = readonly [number, number, number];

export const RAMP_DARK: Rgb = [18, 18, 24];
/** The drawing: empty cells are dark, full ink is near white. */
export const RAMP_INK: Rgb = [245, 245, 245];
/** Feature maps: a bright violet cell means the filter found its pattern there. */
export const RAMP_VIOLET: Rgb = [167, 150, 255];
/** The colour between the cells of the drawing pad (--color-surface-2). */
export const GRID_LINE: Rgb = [28, 28, 38];

export type RampName = 'ink' | 'violet';

/** The colour for a value from 0 (dark) to 1 (bright). Values outside are clamped. */
export function rampColor(value: number, ramp: RampName): Rgb {
  const t = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const top = ramp === 'ink' ? RAMP_INK : RAMP_VIOLET;
  return [
    Math.round(RAMP_DARK[0] + t * (top[0] - RAMP_DARK[0])),
    Math.round(RAMP_DARK[1] + t * (top[1] - RAMP_DARK[1])),
    Math.round(RAMP_DARK[2] + t * (top[2] - RAMP_DARK[2])),
  ];
}
