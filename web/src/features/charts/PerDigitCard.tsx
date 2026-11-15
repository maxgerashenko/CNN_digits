import { EmptyState, GlassCard } from '../../components/ui';
import { cx } from '../../lib/cx';
import styles from './PerDigitCard.module.css';

export interface PerDigitCardProps {
  className?: string;
}

/** The server sends nothing for this card (ARCHITECTURE.md section 9), so it shows an empty state, never sample numbers. */
export function PerDigitCard({ className }: PerDigitCardProps) {
  return (
    <GlassCard className={cx(styles.card, className)}>
      <h2 className={styles.heading}>Accuracy per digit</h2>
      <EmptyState surface="plain" title="Not measured">
        The training server does not send results per digit yet. It reports only the total accuracy, so no bars are drawn.
      </EmptyState>
    </GlassCard>
  );
}
