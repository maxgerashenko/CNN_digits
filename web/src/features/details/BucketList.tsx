import { ListCard, ListRow, Mono, SectionHeading, type Tone } from '../../components/ui';
import { checksInBucket, type CheckBucket, type CheckResult } from '../../lib/checks';
import { cx } from '../../lib/cx';
import styles from './BucketList.module.css';

type ListedBucket = Exclude<CheckBucket, 'first'>;

const COPY: Record<ListedBucket, { title: string; note: string; chip: string; tone: Tone }> = {
  later: {
    title: 'Try later',
    note: 'Same metrics as the cards above. Test them after those.',
    chip: 'later',
    tone: 'warn',
  },
  keep: {
    title: 'Keep',
    note: 'Already at the ideal. No change needed.',
    chip: 'keep',
    tone: 'ok',
  },
  unmeasured: {
    title: 'Not measured',
    note: 'This run holds no number for these checks.',
    chip: 'not measured',
    tone: 'muted',
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
            <Mono tone={copy.tone} className={styles.chip}>
              {copy.chip}
            </Mono>
          </ListRow>
        ))}
      </ListCard>
    </section>
  );
}
