import { formatProbability } from '../../lib/format';
import { cx } from '../../lib/cx';
import styles from './AnswerBars.module.css';

export interface AnswerBarsProps {
  /** Ten probabilities, or null when there is no answer (blank pad, no model). */
  probs: readonly number[] | null;
  /** 'screen' = 4 px bars (phone, pane). 'card' = 6 px rounded bars (tablet). */
  variant?: 'screen' | 'card';
  className?: string;
}

/** Ten horizontal bars, one per digit, the top one in the accent colour. */
export function AnswerBars({ probs, variant = 'screen', className }: AnswerBarsProps) {
  let top = -1;
  if (probs) {
    let best = -1;
    probs.forEach((p, i) => {
      if (p > best) {
        best = p;
        top = i;
      }
    });
  }
  const label = probs
    ? `Probability for each digit 0 to 9; ${top} is highest at ${(probs[top] * 100).toFixed(1)} percent`
    : 'Probability for each digit 0 to 9; nothing to read yet';

  return (
    <div role="img" aria-label={label} className={cx(styles.bars, styles[variant], className)}>
      {Array.from({ length: 10 }, (_, digit) => {
        const p = probs ? probs[digit] : 0;
        const isTop = digit === top;
        return (
          <div key={digit} className={cx(styles.row, isTop && styles.top)}>
            <span className={styles.digit}>{digit}</span>
            <div className={styles.track}>
              <div className={styles.fill} style={{ width: `${Math.max(0, Math.min(1, p)) * 100}%` }} />
            </div>
            <span className={styles.value}>{probs ? formatProbability(p) : '–'}</span>
          </div>
        );
      })}
    </div>
  );
}
