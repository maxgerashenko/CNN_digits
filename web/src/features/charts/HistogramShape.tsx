import { cx } from '../../lib/cx';
import type { Histogram } from '../../types';
import styles from './HistogramShape.module.css';

export interface HistogramShapeProps {
  histogram: Histogram;
  /** 'line' is the small outline of the kernel card; 'ridge' is the filled shape of the histograms card. */
  variant: 'line' | 'ridge';
  /** Centre of the dashed ideal bell, in weight units. Its width is the histogram's own spread. Omit for no bell. */
  idealCentre?: number;
  label: string;
  className?: string;
}

const SIZE = {
  line: { w: 96, h: 34, base: 32, amp: 28 },
  ridge: { w: 124, h: 60, base: 57, amp: 50 },
};
const PAD = 2;
const IDEAL_POINTS = 40;

/** Draws bins (tallest = 1) as a path across the width. Pure geometry, no data of its own. */
export function binsPath(bins: readonly number[], w: number, base: number, amp: number): string {
  if (bins.length === 0) return '';
  const step = bins.length > 1 ? (w - 2 * PAD) / (bins.length - 1) : 0;
  return bins.map((b, i) => `${i === 0 ? 'M' : 'L'}${(PAD + i * step).toFixed(1)} ${(base - amp * b).toFixed(1)}`).join('');
}

/** A bell with the given centre and spread, sampled over lo..hi. Null when it cannot be drawn. */
export function bellPath(lo: number, hi: number, centre: number, std: number, w: number, base: number, amp: number): string | null {
  const span = hi - lo;
  if (!(span > 0) || !(std > 0)) return null;
  const points: string[] = [];
  for (let i = 0; i < IDEAL_POINTS; i++) {
    const t = i / (IDEAL_POINTS - 1);
    const x = lo + t * span;
    const y = base - amp * Math.exp(-((x - centre) ** 2) / (2 * std * std));
    points.push(`${i === 0 ? 'M' : 'L'}${(PAD + t * (w - 2 * PAD)).toFixed(1)} ${y.toFixed(1)}`);
  }
  return points.join('');
}

export function HistogramShape({ histogram, variant, idealCentre, label, className }: HistogramShapeProps) {
  const { w, h, base, amp } = SIZE[variant];
  const line = binsPath(histogram.bins, w, base, amp);
  const ideal = idealCentre === undefined ? null : bellPath(histogram.lo, histogram.hi, idealCentre, histogram.std, w, base, amp);
  return (
    <svg
      role="img"
      aria-label={label}
      className={cx(styles.svg, className)}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      fill="none"
      style={{ aspectRatio: `${w} / ${h}` }}
    >
      <path d={`M0 ${base + 0.5}H${w}`} className={styles.axis} />
      {variant === 'ridge' && line !== '' && (
        <path d={`${line}L${w - PAD} ${base}L${PAD} ${base}Z`} className={styles.ridge} />
      )}
      {variant === 'line' && line !== '' && <path d={line} className={styles.line} />}
      {ideal !== null && <path d={ideal} className={styles.ideal} />}
    </svg>
  );
}
