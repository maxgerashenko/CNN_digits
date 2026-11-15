import { GlassCard, LineChart, Mono } from '../../components/ui';
import { SAVED_MODEL_FACTS } from '../../config';
import { cx } from '../../lib/cx';
import { epochSeries, idealCurve } from '../../lib/curves';
import { formatAccuracy, formatLoss } from '../../lib/format';
import { useTrainingStore } from '../../state/trainingStore';
import styles from './MetricCard.module.css';

export interface MetricCardProps {
  className?: string;
  metric: 'accuracy' | 'loss';
}

const COPY = {
  accuracy: { label: 'Accuracy', hint: 'Should climb fast, then flatten just under the goal line.' },
  loss: { label: 'Loss', hint: 'Should drop fast, then flatten close to 0. Still falling is good.' },
} as const;

/**
 * "on track" while accuracy rises from epoch to epoch, or loss falls.
 * No verdict before two epochs.
 */
export function verdictFor(metric: 'accuracy' | 'loss', values: readonly number[]): 'on track' | 'off track' | null {
  if (values.length < 2) return null;
  const last = values[values.length - 1];
  const before = values[values.length - 2];
  const good = metric === 'accuracy' ? last > before : last < before;
  return good ? 'on track' : 'off track';
}

/** Latest accuracy or loss (on the test images), the goal, and the curve so far. */
export function MetricCard({ className, metric }: MetricCardProps) {
  const epochs = useTrainingStore((s) => s.epochs);
  const jobSettings = useTrainingStore((s) => s.jobSettings);

  const values = epochs.map((e) => (metric === 'accuracy' ? e.valAccuracy : e.valLoss));
  const latest = values.length > 0 ? values[values.length - 1] : null;
  const total = jobSettings?.epochs ?? epochs[epochs.length - 1]?.epochs ?? 1;
  const verdict = verdictFor(metric, values);

  const goalAccuracy = SAVED_MODEL_FACTS.testAccuracy;
  let yDomain: [number, number];
  let ideal;
  if (metric === 'accuracy') {
    const lo = Math.min(...values, goalAccuracy - 0.1);
    yDomain = [lo, goalAccuracy + (goalAccuracy - lo) * 0.05];
    ideal = idealCurve(total, lo, goalAccuracy);
  } else {
    const hi = Math.max(...values, 0.1) * 1.1;
    yDomain = [0, hi];
    ideal = idealCurve(total, hi, 0);
  }

  const valueText = latest === null ? '—' : metric === 'accuracy' ? formatAccuracy(latest) : formatLoss(latest);
  let goalText: string;
  let goalNote: string;
  if (metric === 'accuracy') {
    goalText = `goal ${formatAccuracy(goalAccuracy)}`;
    goalNote =
      latest === null
        ? 'no epoch finished yet'
        : latest >= goalAccuracy
          ? 'goal reached'
          : `${((goalAccuracy - latest) * 100).toFixed(2)} to go`;
  } else {
    goalText = 'goal near 0';
    goalNote = 'lower is better';
  }

  const label =
    latest === null
      ? `${COPY[metric].label}: no epoch has finished yet`
      : `${COPY[metric].label} per epoch: ${values.length} of ${total} epochs so far, latest ${valueText}`;

  return (
    <GlassCard className={cx(styles.card, className)} aria-label={COPY[metric].label}>
      <div className={styles.head}>
        <div className={styles.value}>
          <span className={styles.label}>{COPY[metric].label}</span>
          <span className={styles.number}>{valueText}</span>
        </div>
        <div className={styles.goal}>
          <Mono tone="accent">{goalText}</Mono>
          <Mono>{goalNote}</Mono>
        </div>
      </div>
      <LineChart
        className={styles.chart}
        label={label}
        xDomain={[0, Math.max(total, 1)]}
        yDomain={yDomain}
        goal={metric === 'accuracy' ? goalAccuracy : 0}
        baseline={metric === 'accuracy'}
        midline
        lines={[
          { id: 'ideal', tone: 'ideal', points: ideal },
          { id: 'now', tone: 'now', points: epochSeries(values), endDot: true },
        ]}
      />
      <div className={styles.hint}>
        {verdict && (
          <Mono className={styles.verdict} tone={verdict === 'on track' ? 'ok' : 'warn'}>
            {verdict}
          </Mono>
        )}
        <p className={styles.hintText}>{COPY[metric].hint}</p>
      </div>
    </GlassCard>
  );
}
