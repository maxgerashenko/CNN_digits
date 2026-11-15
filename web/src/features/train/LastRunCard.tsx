import { EmptyState, NavRow } from '../../components/ui';
import { useInPane } from '../../hooks/usePane';
import { cx } from '../../lib/cx';
import { describeRun } from '../../lib/checks';
import { ROUTES } from '../../routes';
import { selectLatestRun, useTrainingStore } from '../../state/trainingStore';
import styles from './LastRunCard.module.css';

export interface LastRunCardProps {
  className?: string;
}

/** The result of the latest run, or "No runs yet". Links to Details except inside a pane. */
export function LastRunCard({ className }: LastRunCardProps) {
  const run = useTrainingStore(selectLatestRun);
  const inPane = useInPane();

  if (!run) {
    return (
      <EmptyState title="No runs yet" className={cx(styles.card, className)}>
        Each setting below shows what the first run will check and the ideal result. Dashed line is the ideal shape.
      </EmptyState>
    );
  }

  const hint = 'Each setting below shows its check: last run against ideal.';
  if (inPane) {
    return (
      <EmptyState title="Last run" className={cx(styles.card, className)}>
        <span className={styles.result}>{describeRun(run)}</span>
        {hint}
      </EmptyState>
    );
  }
  return (
    <NavRow
      to={ROUTES.details}
      eyebrow="Last run"
      title={<span className={styles.result}>{describeRun(run)}</span>}
      subtitle={hint}
      className={className}
    />
  );
}
