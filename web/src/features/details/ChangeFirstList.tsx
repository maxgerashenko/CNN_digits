import { EmptyState, SectionHeading } from '../../components/ui';
import { useRunChecks } from '../../hooks/useRunChecks';
import { checksInBucket } from '../../lib/checks';
import { cx } from '../../lib/cx';
import { ChangeFirstCard } from './ChangeFirstCard';
import styles from './ChangeFirstList.module.css';

export interface ChangeFirstListProps {
  className?: string;
}

/** The "Change first" heading and one full card per failed check that is worth trying first. */
export function ChangeFirstList({ className }: ChangeFirstListProps) {
  const { run, checks } = useRunChecks();
  // Without a run the screen shows its own "No runs yet" state.
  if (!run) return null;
  const first = checksInBucket(checks, 'first');
  return (
    <div className={cx(styles.list, className)}>
      <SectionHeading>Change first</SectionHeading>
      {first.length === 0 ? (
        <EmptyState title="Nothing to change first">
          Every setting that can be tried passed its check in this run.
        </EmptyState>
      ) : (
        first.map((check) => <ChangeFirstCard key={check.key} check={check} />)
      )}
    </div>
  );
}
