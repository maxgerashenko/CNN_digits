import { EmptyState, GlassCard } from '../../components/ui';
import { cx } from '../../lib/cx';
import styles from './ConfusionCard.module.css';

export interface ConfusionCardProps {
  className?: string;
}

/** The server sends nothing for this card (ARCHITECTURE.md section 9), so it shows an empty state, never sample numbers. */
export function ConfusionCard({ className }: ConfusionCardProps) {
  return (
    <GlassCard className={cx(styles.card, className)}>
      <h2 className={styles.heading}>Confusion matrix</h2>
      <EmptyState surface="plain" title="Not measured">
        The training server does not send which digit was read as which yet. It reports only the total number of mistakes, so no grid is drawn.
      </EmptyState>
    </GlassCard>
  );
}
