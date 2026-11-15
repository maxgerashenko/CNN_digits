import { EmptyState, ListCard, ListRow, Mono, NavRow, SectionHeading } from '../../components/ui';
import { useRunChecks } from '../../hooks/useRunChecks';
import { CHANGE_FIRST_COUNT, checksInBucket } from '../../lib/checks';
import { cx } from '../../lib/cx';
import { ROUTES } from '../../routes';
import { ChangeFirstCard } from './ChangeFirstCard';
import styles from './ChangeFirstColumn.module.css';

export interface ChangeFirstColumnProps {
  className?: string;
}

const count = (n: number) => `${n} ${n === 1 ? 'setting' : 'settings'}`;

/** Tablet Train, column 3: compact "Change first" cards, then the counts and the Raw charts link. */
export function ChangeFirstColumn({ className }: ChangeFirstColumnProps) {
  const { run, checks } = useRunChecks();

  if (!run) {
    return (
      <div className={cx(styles.column, className)}>
        <SectionHeading inset={false}>Change first</SectionHeading>
        <EmptyState title="No runs yet">Train once and the settings to change first appear here.</EmptyState>
      </div>
    );
  }

  const first = checksInBucket(checks, 'first').slice(0, CHANGE_FIRST_COUNT);
  const later = checksInBucket(checks, 'later').length;
  const keep = checksInBucket(checks, 'keep').length;

  return (
    <div className={cx(styles.column, className)}>
      <SectionHeading inset={false}>Change first</SectionHeading>
      {first.length === 0 ? (
        <EmptyState title="Nothing to change first">
          Every setting that can be tried passed its check in this run.
        </EmptyState>
      ) : (
        first.map((check) => <ChangeFirstCard key={check.key} check={check} variant="compact" />)
      )}
      <ListCard className={styles.summary}>
        <ListRow>
          <span>Try later</span>
          <Mono tone="warn" size="small">
            {count(later)}
          </Mono>
        </ListRow>
        <ListRow>
          <span>Keep</span>
          <Mono tone="ok" size="small">
            {count(keep)}
          </Mono>
        </ListRow>
        <NavRow surface="plain" to={ROUTES.charts} title="Raw charts" />
      </ListCard>
    </div>
  );
}
