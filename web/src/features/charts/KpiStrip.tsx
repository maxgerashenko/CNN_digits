import { Mono } from '../../components/ui';
import { cx } from '../../lib/cx';
import { formatAccuracy, formatInt } from '../../lib/format';
import { runSecondsPerEpoch } from '../../lib/checks';
import { formatSetting } from '../../lib/settings';
import type { RunRecord } from '../../types';
import styles from './KpiStrip.module.css';

export interface KpiStripProps {
  run: RunRecord;
  className?: string;
}

/** Four equal cells with the headline numbers of the latest run. */
export function KpiStrip({ run, className }: KpiStripProps) {
  const seconds = runSecondsPerEpoch(run);
  const cells = [
    { label: 'val acc', value: formatAccuracy(run.results.valAccuracy) },
    { label: 'mistakes', value: formatInt(run.results.mistakes) },
    { label: 's / epoch', value: seconds === null ? '–' : formatInt(seconds) },
    { label: 'lr', value: formatSetting('learning_rate', run.settings.learning_rate) },
  ];
  return (
    <dl className={cx(styles.strip, className)} aria-label="Latest run">
      {cells.map((cell) => (
        <div key={cell.label} className={styles.cell}>
          <Mono as="dt">{cell.label}</Mono>
          <dd className={styles.value}>{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}
