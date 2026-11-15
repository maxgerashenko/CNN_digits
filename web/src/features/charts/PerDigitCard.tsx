import type { CSSProperties } from 'react';

import { EmptyState, GlassCard, Mono } from '../../components/ui';
import { cx } from '../../lib/cx';
import type { RunRecord } from '../../types';
import { listDigits, perDigitAccuracy } from './chartData';
import styles from './PerDigitCard.module.css';

export interface PerDigitCardProps {
  run: RunRecord;
  className?: string;
}

/** How many of the weakest digits are marked. */
const WEAK_COUNT = 3;

const percent = (share: number) => `${(share * 100).toFixed(1)}`;

/** One bar per digit: the share of its test images that the run read correctly. */
export function PerDigitCard({ run, className }: PerDigitCardProps) {
  const confusion = run.results.confusion;

  if (!confusion) {
    return (
      <GlassCard className={cx(styles.card, className)}>
        <h2 className={styles.heading}>Accuracy per digit</h2>
        <EmptyState surface="plain" title="Not measured">
          The training server did not send results per digit for this run, only the total accuracy, so no bars are drawn.
        </EmptyState>
      </GlassCard>
    );
  }

  const digits = perDigitAccuracy(confusion);
  const byAccuracy = [...digits].sort((a, b) => a.accuracy - b.accuracy || a.digit - b.digit);
  const weak = byAccuracy.filter((d) => d.accuracy < 1).slice(0, WEAK_COUNT);
  const weakest = byAccuracy[0];
  // Of the digits with the same accuracy, the lowest digit is named.
  const best = digits.reduce((top, d) => (d.accuracy > top.accuracy ? d : top));
  // The chart starts at 95%, or lower in steps of 5 when a digit is below that.
  const floor = Math.min(95, Math.floor((weakest.accuracy * 100) / 5) * 5);

  return (
    <GlassCard className={cx(styles.card, className)}>
      <div className={styles.top}>
        <h2 className={styles.heading}>Accuracy per digit</h2>
        <Mono>{floor} – 100%</Mono>
      </div>
      <div
        role="img"
        aria-label={`Accuracy per digit; ${weakest.digit} is weakest at ${percent(weakest.accuracy)} percent, ${best.digit} is best at ${percent(best.accuracy)}`}
        className={styles.chart}
      >
        <div className={styles.goal} />
        {digits.map((d) => {
          const isWeak = weak.includes(d);
          const height = Math.max(0, ((d.accuracy * 100 - floor) / (100 - floor)) * 100);
          return (
            <div key={d.digit} className={styles.column} title={`${d.digit}: ${percent(d.accuracy)}%`}>
              <div className={styles.track}>
                <div
                  className={cx(styles.bar, isWeak && styles.weak)}
                  style={{ '--h': `${height}%` } as CSSProperties}
                  data-testid={`digit-bar-${d.digit}`}
                />
              </div>
              <Mono size="hint" tone={isWeak ? 'text' : 'muted'}>
                {d.digit}
              </Mono>
            </div>
          );
        })}
      </div>
      <p className={styles.text}>
        Ideal: every bar at the purple goal line.{' '}
        {weak.length > 0 ? `Weakest here: ${listDigits(weak.map((d) => d.digit))}.` : 'Here every digit is at the line.'}
      </p>
    </GlassCard>
  );
}
