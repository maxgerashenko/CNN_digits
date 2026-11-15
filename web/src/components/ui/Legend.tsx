import { cx } from '../../lib/cx';
import styles from './Legend.module.css';

/**
 * 'now'    = white solid line (your network, the latest run, train)
 * 'accent' = violet solid line (the run before, validation)
 * 'ideal'  = grey dashed line (ideal shape)
 * 'goal'   = thin violet line (the goal)
 */
export type LineStyle = 'now' | 'accent' | 'ideal' | 'goal';

export interface LegendItem {
  label: string;
  line: LineStyle;
}

export interface LegendProps {
  items: readonly LegendItem[];
  className?: string;
}

/** The row of line samples with names above the charts. */
export function Legend({ items, className }: LegendProps) {
  return (
    <ul className={cx(styles.legend, className)}>
      {items.map((item) => (
        <li key={item.label} className={styles.item}>
          <span aria-hidden="true" className={cx(styles.sample, styles[item.line])} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
