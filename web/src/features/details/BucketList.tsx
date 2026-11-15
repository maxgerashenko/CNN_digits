import { ListCard, ListRow, Mono, SectionHeading } from '../../components/ui';
import { BUCKET_WORD, checksInBucket, type CheckBucket, type CheckResult } from '../../lib/checks';
import { cx } from '../../lib/cx';
import styles from './BucketList.module.css';

type ListedBucket = Exclude<CheckBucket, 'first'>;

const COPY: Record<ListedBucket, { title: string; note: string }> = {
  later: {
    title: 'Try later',
    note: 'Same metrics as the cards above. Test them after those.',
  },
  keep: {
    title: 'Keep',
    note: 'Already at the ideal. No change needed.',
  },
  unmeasured: {
    title: 'Not measured',
    note: 'This run holds no number for these checks.',
  },
};

export interface BucketListProps {
  bucket: ListedBucket;
  checks: readonly CheckResult[];
  className?: string;
}

/** One list of settings ("Try later", "Keep", "Not measured"). Left out when empty. */
export function BucketList({ bucket, checks, className }: BucketListProps) {
  const rows = checksInBucket(checks, bucket);
  if (rows.length === 0) return null;
  const copy = COPY[bucket];

  return (
    <section className={cx(styles.group, className)}>
      <SectionHeading note={copy.note}>{copy.title}</SectionHeading>
      <ListCard as="ul">
        {rows.map((check) => (
          <ListRow as="li" key={check.key}>
            <span className={styles.text}>
              <span className={styles.name}>
                {check.label} <span className={styles.value}>{check.valueText}</span>
              </span>
              <Mono>
                {bucket === 'unmeasured'
                  ? (check.reason ?? 'Not measured.')
                  : `${check.metricShort} ${check.lastText ?? ''} · ideal ${check.idealShort}`}
              </Mono>
            </span>
            <Mono tone={BUCKET_WORD[bucket].tone} className={styles.chip}>
              {BUCKET_WORD[bucket].text}
            </Mono>
          </ListRow>
        ))}
      </ListCard>
    </section>
  );
}
