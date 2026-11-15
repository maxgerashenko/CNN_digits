import type { CSSProperties } from 'react';

import { EmptyState, GlassCard, Mono } from '../../components/ui';
import { cx } from '../../lib/cx';
import type { RunRecord } from '../../types';
import { largestMistake, perDigitAccuracy, topConfusions } from './chartData';
import styles from './ConfusionCard.module.css';

export interface ConfusionCardProps {
  run: RunRecord;
  className?: string;
}

/** 10 by 10 cells: row = the digit that was drawn, column = the digit the run read. */
export function ConfusionCard({ run, className }: ConfusionCardProps) {
  const confusion = run.results.confusion;

  if (!confusion) {
    return (
      <GlassCard className={cx(styles.card, className)}>
        <h2 className={styles.heading}>Confusion matrix</h2>
        <EmptyState surface="plain" title="Not measured">
          The training server did not send which digit was read as which for this run, only the total number of
          mistakes, so no grid is drawn.
        </EmptyState>
      </GlassCard>
    );
  }

  const accuracy = perDigitAccuracy(confusion);
  const largest = largestMistake(confusion);
  const top = topConfusions(confusion);

  // How strongly a cell is lit, 0..1.
  const light = (drawn: number, readAs: number, count: number) => {
    if (drawn === readAs) return 0.15 + 0.45 * accuracy[drawn].accuracy;
    if (count === 0) return 0.04;
    return 0.1 + 0.85 * (count / largest);
  };

  const label =
    top.length > 0
      ? `Confusion matrix, 10 by 10. Most frequent mistakes: ${top.map((c) => `${c.drawn} read as ${c.readAs}, ${c.count} times`).join('; ')}`
      : 'Confusion matrix, 10 by 10. No mistakes: only the diagonal is lit';

  return (
    <GlassCard className={cx(styles.card, className)}>
      <h2 className={styles.heading}>Confusion matrix</h2>
      <div className={styles.body}>
        <Mono className={styles.side}>drawn 9 → 0</Mono>
        <div className={styles.main}>
          <div role="img" aria-label={label} className={styles.matrix}>
            {confusion.map((row, drawn) => (
              <div key={drawn} className={styles.row}>
                {row.map((count, readAs) => (
                  <div
                    key={readAs}
                    className={cx(styles.cell, drawn === readAs && styles.diagonal)}
                    style={{ '--light': light(drawn, readAs, count).toFixed(2) } as CSSProperties}
                    title={`${drawn} read as ${readAs}: ${count}`}
                    data-testid={`cell-${drawn}-${readAs}`}
                  />
                ))}
              </div>
            ))}
          </div>
          <Mono className={styles.bottom}>read as 0 → 9</Mono>
        </div>
      </div>
      {top.length > 0 && (
        <ul className={styles.chips} aria-label="Most frequent mistakes">
          {top.map((c) => (
            <Mono as="li" tone="text" key={`${c.drawn}-${c.readAs}`} className={styles.chip}>
              {c.drawn} → {c.readAs} · {c.count}
            </Mono>
          ))}
        </ul>
      )}
      <p className={styles.text}>
        Ideal: only the purple diagonal is lit. A white cell off the diagonal is a pair of digits the network mixes up.
      </p>
    </GlassCard>
  );
}
