import { cx } from '../../lib/cx';
import styles from './ProgressBar.module.css';

export interface ProgressBarProps {
  /** Name for screen readers, for example "Training progress". */
  label: string;
  /** 0 to 1. */
  value: number;
  className?: string;
}

/** The thin 4px progress line of the Training screen. */
export function ProgressBar({ label, value, className }: ProgressBarProps) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cx(styles.track, className)}
    >
      <div className={styles.fill} style={{ width: `${percent}%` }} />
    </div>
  );
}
