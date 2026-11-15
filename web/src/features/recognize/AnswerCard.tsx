import { EmptyState, GlassCard } from '../../components/ui';
import { cx } from '../../lib/cx';
import { AnswerBars } from './AnswerBars';
import { answerSpec, noModelText, useReading } from './reading';
import styles from './AnswerCard.module.css';

export interface AnswerCardProps {
  className?: string;
}

/** Tablet column 3: the ten probabilities as a card that fills the column. */
export function AnswerCard({ className }: AnswerCardProps) {
  const { model, modelStatus, result } = useReading();
  return (
    <GlassCard className={cx(styles.card, className)} aria-labelledby="answer-title">
      <div className={styles.head}>
        <h2 id="answer-title" className={styles.heading}>
          Answer
        </h2>
        {model && <span className={styles.spec}>{answerSpec(model.info.flatten, model.info.dense)}</span>}
      </div>
      {model ? (
        <>
          <span className={styles.note}>10 probabilities that add up to 100%.</span>
          <AnswerBars probs={result?.probs ?? null} variant="card" className={styles.bars} />
          {!result && <span className={styles.note}>Draw a digit to see the probabilities.</span>}
        </>
      ) : (
        <EmptyState title="No model" surface="plain">
          {noModelText(modelStatus)}
        </EmptyState>
      )}
    </GlassCard>
  );
}
