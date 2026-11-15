import { Mono } from '../../components/ui';
import type { CheckResult } from '../../lib/checks';
import { IDEAL_SPARK, sparkPath } from '../../lib/curves';
import styles from './CheckStrip.module.css';

export interface CheckStripProps {
  check: CheckResult;
}

const STATUS_WORD = { new: 'new', ok: 'ok', improve: 'improve', unmeasured: 'not measured' } as const;
const STATUS_TONE = { new: 'muted', ok: 'ok', improve: 'warn', unmeasured: 'muted' } as const;

/** Under a setting: the ideal shape, the run's line, what is checked, ideal against last, and the verdict. */
export function CheckStrip({ check }: CheckStripProps) {
  const run = sparkPath(check.series);
  return (
    <div className={styles.strip} data-status={check.status}>
      <svg aria-hidden="true" width="40" height="20" viewBox="0 0 40 20" fill="none" strokeLinecap="round" className={styles.spark}>
        <path d={IDEAL_SPARK[check.shape]} stroke="var(--color-ideal)" strokeWidth="1.5" strokeDasharray="3 3" />
        {run && <path d={run} stroke="var(--color-text)" strokeWidth="1.5" />}
      </svg>
      <div className={styles.text}>
        <span className={styles.metric}>
          Checks <span className={styles.metricName}>{check.metric}</span>
        </span>
        <Mono tone="muted" size="label">
          ideal {check.idealText}
          {check.lastText != null && ` · last ${check.lastText}`}
        </Mono>
        {check.status === 'unmeasured' && check.reason && <span className={styles.reason}>{check.reason}</span>}
      </div>
      <Mono tone={STATUS_TONE[check.status]} size="label" className={styles.status}>
        {STATUS_WORD[check.status]}
      </Mono>
    </div>
  );
}
