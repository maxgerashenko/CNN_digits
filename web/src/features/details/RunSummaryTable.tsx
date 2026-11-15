import { GlassCard } from '../../components/ui';
import { cx } from '../../lib/cx';
import { summarizeRuns } from '../../lib/checks';
import { useRunChecks } from '../../hooks/useRunChecks';
import styles from './RunSummaryTable.module.css';

export interface RunSummaryTableProps {
  className?: string;
  /** The tablet form: tighter rows and smaller side numbers. */
  compact?: boolean;
}

/** The run before, the latest run and the ideal, in three rows. Shows nothing before the first run. */
export function RunSummaryTable({ className, compact = false }: RunSummaryTableProps) {
  const { run, prev } = useRunChecks();
  if (!run) return null;

  const rows = summarizeRuns(run, prev);
  const before = prev ? prev.number : run.number - 1;
  const beforeHead = before >= 1 ? `run ${before}` : 'before';

  return (
    <GlassCard padding="none" className={cx(styles.card, className)}>
      <table className={cx(styles.table, compact && styles.compact)} aria-label="Run summary">
        <thead>
          <tr>
            <th scope="col">
              <span className={styles.sr}>Measure</span>
            </th>
            <th scope="col" className={styles.head}>
              {beforeHead}
            </th>
            <th scope="col" className={cx(styles.head, styles.headNow)}>
              {`run ${run.number}`}
            </th>
            <th scope="col" className={styles.head}>
              ideal
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <th scope="row" className={styles.name}>
                {row.name}
              </th>
              <td className={styles.prev}>{row.prev ?? '–'}</td>
              <td className={styles.now}>{row.now}</td>
              <td className={styles.ideal}>{row.ideal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}
