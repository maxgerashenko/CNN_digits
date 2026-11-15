import { formatProbability } from '../../lib/format';
import { cx } from '../../lib/cx';
import styles from './ProbabilityColumns.module.css';

export interface ProbabilityColumnsProps {
  /** Ten probabilities 0..1, or null for empty bars. */
  probs: number[] | null;
  /** The digit with the highest probability, drawn in the accent colour. */
  top: number | null;
  className?: string;
}

/** Ten vertical bars, one per digit. The top one is violet. */
export function ProbabilityColumns({ probs, top, className }: ProbabilityColumnsProps) {
  const label =
    probs && top !== null
      ? `Probability for each digit 0 to 9; ${top} is highest at ${formatProbability(probs[top])}`
      : 'Probability for each digit 0 to 9; nothing to read yet';
  return (
    <div role="img" aria-label={label} className={cx(styles.columns, className)}>
      {Array.from({ length: 10 }, (_, digit) => {
        const share = probs ? probs[digit] : 0;
        const isTop = digit === top;
        return (
          <div key={digit} className={styles.column}>
            <div className={styles.track}>
              <div
                className={cx(styles.bar, isTop && styles.top)}
                style={{ height: `${Math.max(0, Math.min(1, share)) * 100}%` }}
              />
            </div>
            <span className={cx(styles.digit, isTop && styles.digitTop)}>{digit}</span>
          </div>
        );
      })}
    </div>
  );
}
