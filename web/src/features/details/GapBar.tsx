import { cx } from '../../lib/cx';
import styles from './GapBar.module.css';

export interface GapBarProps {
  /** Text at the left end: the previous run's value. Null without a previous run. */
  prevText: string | null;
  nowText: string;
  idealText: string;
  /** Share of the gap closed, 0 to 100. Null leaves the bar and the percent out. */
  closed: number | null;
  /** Short form for the tablet column: "now · 56%", plain end marks. */
  compact?: boolean;
  className?: string;
}

/** The bar from the previous run to the ideal, filled to the share this run closed. */
export function GapBar({ prevText, nowText, idealText, closed, compact = false, className }: GapBarProps) {
  const showBar = closed !== null && prevText !== null;
  const label = showBar ? `${closed}% of the gap closed` : null;
  return (
    <div className={cx(styles.wrap, className)}>
      {showBar && (
        <div
          role="img"
          aria-label={`${closed} percent of the gap between the previous run (${prevText}) and the ideal (${idealText}) is closed`}
          className={styles.track}
        >
          <div className={styles.fill} style={{ width: `${closed}%` }} />
          {!compact && <div className={styles.startMark} />}
          {!compact && <div className={styles.idealMark} />}
        </div>
      )}
      <div className={styles.labels}>
        {prevText !== null ? <span className={styles.prev}>{prevText}</span> : <span />}
        <span className={styles.now}>
          {nowText}
          {label && ` · ${compact ? `${closed}%` : label}`}
        </span>
        <span className={styles.ideal}>{idealText}</span>
      </div>
    </div>
  );
}
