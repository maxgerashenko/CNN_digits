import { EmptyState, GlassCard, Mono } from '../../components/ui';
import { cx } from '../../lib/cx';
import { formatProbability } from '../../lib/format';
import { ProbabilityColumns } from './ProbabilityColumns';
import { noModelText, noModelTitle, useReading } from './reading';
import styles from './ResultCard.module.css';

export interface ResultCardProps {
  className?: string;
  /** 'bars' = the phone card with ten bars. 'wide' = the tablet card: words left, digit and percentage right. */
  variant: 'bars' | 'wide';
  /** 'bars' only: 'small' is the low card shown after the phone screen is scrolled. Default 'large'. */
  size?: 'large' | 'small';
}

/** The answer: the most likely digit, how sure the network is, and (phone) the ten probabilities. */
export function ResultCard({ className, variant, size = 'large' }: ResultCardProps) {
  const { modelStatus, modelError, status, result } = useReading();

  const reading = status === 'ready' && result !== null;
  const digit = reading ? String(result.digit) : '–';
  const percent = reading ? formatProbability(result.probs[result.digit]) : null;

  if (modelStatus !== 'ready') {
    return (
      <GlassCard
        className={cx(styles.card, styles.problem, variant === 'bars' && styles.bars, size === 'small' && styles.small, className)}
        aria-label="Result"
      >
        <EmptyState surface="plain" title={noModelTitle(modelStatus)}>
          {modelError ?? noModelText(modelStatus)}
        </EmptyState>
      </GlassCard>
    );
  }

  const hint = reading ? 'Most likely digit and how sure the network is.' : 'Draw a digit on the pad to see it read.';

  if (variant === 'wide') {
    return (
      <GlassCard className={cx(styles.card, styles.wide, className)} aria-label="Result">
        <div className={styles.words}>
          <h2 className={styles.heading}>Result</h2>
          <p className={styles.sentence}>{hint}</p>
        </div>
        <div className={styles.answer} aria-live="polite">
          <span className={cx(styles.digit, styles.wideDigit, !reading && styles.none)}>{digit}</span>
          {percent && (
            <Mono tone="accent" className={styles.widePercent}>
              {percent}
            </Mono>
          )}
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className={cx(styles.card, styles.bars, size === 'small' && styles.small, className)} aria-label="Result">
      <div className={styles.side} aria-live="polite">
        <span className={cx(styles.digit, styles.barsDigit, !reading && styles.none)}>{digit}</span>
        <span className={styles.meta}>
          <Mono tone="muted">Result</Mono>
          <Mono tone="accent" size="small">
            {percent ?? 'Draw a digit'}
          </Mono>
        </span>
      </div>
      <ProbabilityColumns probs={reading ? result.probs : null} top={reading ? result.digit : null} />
    </GlassCard>
  );
}
