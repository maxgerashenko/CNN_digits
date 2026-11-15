import { GlassCard, LineChart, Mono } from '../../components/ui';
import type { ChartLine } from '../../components/ui/LineChart';
import { STATUS_WORD, type CheckStatus } from '../../lib/checks';
import { cx } from '../../lib/cx';
import { epochSeries, extent, idealCurve } from '../../lib/curves';
import { formatAccuracy, formatLoss } from '../../lib/format';
import { SAVED_MODEL_FACTS } from '../../config';
import type { RunRecord } from '../../types';
import styles from './CurveCard.module.css';

export interface CurveCardProps {
  metric: 'accuracy' | 'loss';
  run: RunRecord;
  /** Status of the matching check; the word in the card's corner. */
  status: CheckStatus;
  className?: string;
}

const last = (list: readonly number[]) => list[list.length - 1];

function sentence(metric: 'accuracy' | 'loss', train: number[], val: number[]): string {
  if (metric === 'accuracy') {
    const goal = SAVED_MODEL_FACTS.testAccuracy;
    let text =
      `Ideal: both lines rise together and end within 1 pt of the goal. Here: train ${formatAccuracy(last(train))}, ` +
      `validation ${formatAccuracy(last(val))}, goal ${formatAccuracy(goal)}.`;
    if (val.length > 1 && last(val) > val[val.length - 2] && last(val) < goal) {
      text += ' Still rising, more epochs would help.';
    }
    return text;
  }
  let text = 'Ideal: both fall and stay close. Warning sign: validation turns up while train keeps falling. That is overfitting.';
  text += ` Here: train ${formatLoss(last(train))}, validation ${formatLoss(last(val))}.`;
  if (val.length > 1 && train.length > 1 && last(val) > val[val.length - 2] && last(train) < train[train.length - 2]) {
    text += ' Validation turned up in the last epoch while train fell.';
  }
  return text;
}

/** Train (white) and validation (violet) per epoch, with the dashed ideal shape. */
export function CurveCard({ metric, run, status, className }: CurveCardProps) {
  const isAccuracy = metric === 'accuracy';
  const train = run.epochs.map((e) => (isAccuracy ? e.accuracy : e.loss));
  const val = run.epochs.map((e) => (isAccuracy ? e.valAccuracy : e.valLoss));
  const title = isAccuracy ? 'Accuracy, train vs validation' : 'Loss, train vs validation';
  // No word in the corner before the first run.
  const word = status === 'new' ? null : STATUS_WORD[status];
  const hasData = train.length > 0;

  const lastEpoch = Math.max(2, run.epochs.length);
  const goal = isAccuracy ? SAVED_MODEL_FACTS.testAccuracy : 0;
  const yDomain = extent([train, val, [goal]]);
  const [lo, hi] = yDomain;
  // The ideal is a drawing of the shape only: it spans the chart from edge to edge.
  const ideal = (isAccuracy ? idealCurve(lastEpoch - 1, lo, goal) : idealCurve(lastEpoch - 1, hi, goal)).map((p) => ({
    x: p.x + 1,
    y: p.y,
  }));
  const lines: ChartLine[] = [
    { id: 'ideal', points: ideal, tone: 'ideal' },
    { id: 'train', points: epochSeries(train), tone: 'now' },
    { id: 'val', points: epochSeries(val), tone: 'accent' },
  ];
  const label = hasData
    ? `${title}: train ${isAccuracy ? formatAccuracy(last(train)) : formatLoss(last(train))}, validation ${
        isAccuracy ? formatAccuracy(last(val)) : formatLoss(last(val))
      } after ${run.epochs.length} epoch${run.epochs.length === 1 ? '' : 's'}`
    : `${title}: no epochs`;

  return (
    <GlassCard className={cx(styles.card, className)} aria-label={title}>
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {word && <Mono tone={word.tone}>{word.text}</Mono>}
      </div>
      <LineChart lines={lines} xDomain={[1, lastEpoch]} yDomain={yDomain} height={90} baseline midline label={label} />
      {hasData && <p className={styles.text}>{sentence(metric, train, val)}</p>}
    </GlassCard>
  );
}
