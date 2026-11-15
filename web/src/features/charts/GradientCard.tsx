import { EmptyState, GlassCard } from '../../components/ui';
import { cx } from '../../lib/cx';
import styles from './GradientCard.module.css';

export interface GradientCardProps {
  className?: string;
}

/** The server sends nothing for this card (ARCHITECTURE.md section 9), so it shows an empty state, never sample numbers. */
export function GradientCard({ className }: GradientCardProps) {
  return (
    <GlassCard className={cx(styles.card, className)}>
      <h2 className={styles.heading}>Gradient size per layer</h2>
      <EmptyState surface="plain" title="Not measured">
        The training server does not send gradient sizes yet, so no dots are drawn.
      </EmptyState>
    </GlassCard>
  );
}
