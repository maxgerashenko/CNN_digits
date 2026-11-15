import type { ChartPoint } from '../../lib/curves';
import { cx } from '../../lib/cx';
import styles from './LineChart.module.css';

export interface ChartLine {
  id: string;
  /** Points in data units. A line with one point shows only its end dot. */
  points: readonly ChartPoint[];
  /**
   * 'now'    = white, 2px (your network, the latest run, train)
   * 'accent' = violet (the run before, validation)
   * 'ideal'  = grey dashed (ideal shape)
   */
  tone: 'now' | 'accent' | 'ideal';
  /** A dot on the last point (the live curve on the Training screen). */
  endDot?: boolean;
}

export interface LineChartProps {
  lines: readonly ChartLine[];
  /** [smallest, largest] x and y in data units. Points outside are clipped. */
  xDomain: readonly [number, number];
  yDomain: readonly [number, number];
  /** Height in px. The width always follows the container. Default 96. */
  height?: number;
  /** Draws the thin violet goal line at this y value. */
  goal?: number;
  /** A grey line along the bottom. */
  baseline?: boolean;
  /** A grey vertical line in the middle. */
  midline?: boolean;
  /** What the chart shows, in words, for screen readers. */
  label: string;
  className?: string;
}

// The plot keeps a little room above and below so thick lines are not cut.
const PAD_Y = 4;

/**
 * A small line chart that stretches to its container. Lines keep their
 * thickness at any width. It draws the points it is given and nothing else:
 * no smoothing, no made-up points between epochs.
 */
export function LineChart({
  lines,
  xDomain,
  yDomain,
  height = 96,
  goal,
  baseline = false,
  midline = false,
  label,
  className,
}: LineChartProps) {
  const [x0, x1] = xDomain;
  const [y0, y1] = yDomain;
  const toX = (x: number) => (x1 === x0 ? 0 : ((x - x0) / (x1 - x0)) * 100);
  const toY = (y: number) => {
    const share = y1 === y0 ? 0.5 : (y - y0) / (y1 - y0);
    return PAD_Y + (1 - Math.max(0, Math.min(1, share))) * (100 - 2 * PAD_Y);
  };
  const path = (points: readonly ChartPoint[]) =>
    points.map((p, i) => `${i ? 'L' : 'M'}${toX(p.x).toFixed(2)} ${toY(p.y).toFixed(2)}`).join('');

  return (
    <div role="img" aria-label={label} className={cx(styles.chart, className)} style={{ height }}>
      <svg className={styles.svg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {baseline && <path className={styles.rule} d="M0 99.5H100" />}
        {midline && <path className={styles.rule} d="M50 0V100" />}
        {goal !== undefined && <path className={styles.goal} d={`M0 ${toY(goal).toFixed(2)}H100`} />}
        {lines.map((line) =>
          line.points.length > 1 ? <path key={line.id} className={styles[line.tone]} d={path(line.points)} /> : null,
        )}
      </svg>
      {lines.map((line) => {
        const last = line.points[line.points.length - 1];
        if (!last || !(line.endDot || line.points.length === 1)) return null;
        return (
          <span
            key={line.id}
            aria-hidden="true"
            className={cx(styles.dot, styles[`dot-${line.tone}`])}
            style={{ left: `${toX(last.x)}%`, top: `${toY(last.y)}%` }}
          />
        );
      })}
    </div>
  );
}
