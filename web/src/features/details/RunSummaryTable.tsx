import { GlassCard } from '../../components/ui';
import { cx } from '../../lib/cx';
import { summarizeRuns } from '../../lib/checks';
import { useRunChecks } from '../../hooks/useRunChecks';
import styles from './RunSummaryTable.module.css';

export interface RunSummaryTableProps {
  className?: string;
  /** The tablet form: tighter rows and smaller side numbers. */
  compact?: boolean;
  /**
   * 'panel' = the phone form: one column per measure, with the run's value
   * large and the run before and the ideal under it. Default 'table'.
   */
  variant?: 'table' | 'panel';
  /** 'panel' only: the short version, which shows the names and the run's values and hides the rest. */
  short?: boolean;
}

/** The run before, the latest run and the ideal, in three rows. Shows nothing before the first run. */
export function RunSummaryTable({ className, compact = false, variant = 'table', short = false }: RunSummaryTableProps) {
  const { run, prev } = useRunChecks();
  if (!run) return null;

  const rows = summarizeRuns(run, prev);
  const before = prev ? prev.number : run.number - 1;
  const beforeHead = before >= 1 ? `run ${before}` : 'before';

  // The panel form lays the table out with flexbox. Browsers then stop treating
  // it as a table, so every part states its role.
  return (
    <GlassCard padding="none" className={cx(styles.card, className)}>
      <table
        className={cx(styles.table, compact && styles.compact, variant === 'panel' && styles.panel, short && styles.short)}
        aria-label="Run summary"
        role="table"
      >
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">
              <span className={styles.sr}>Measure</span>
            </th>
            <th scope="col" role="columnheader" className={cx(styles.head, styles.prevCell)}>
              {beforeHead}
            </th>
            <th scope="col" role="columnheader" className={cx(styles.head, styles.headNow, styles.nowCell)}>
              {`run ${run.number}`}
            </th>
            <th scope="col" role="columnheader" className={cx(styles.head, styles.idealCell)}>
              ideal
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr key={row.name} role="row">
              <th scope="row" role="rowheader" className={styles.name}>
                {row.name}
              </th>
              <td role="cell" className={cx(styles.prev, styles.prevCell)}>{row.prev ?? '–'}</td>
              <td role="cell" className={cx(styles.now, styles.nowCell)}>{row.now}</td>
              <td role="cell" className={cx(styles.ideal, styles.idealCell)}>{row.ideal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}
