import { GlassCard, Mono, SectionHeading } from '../../components/ui';
import { cx } from '../../lib/cx';
import type { RunRecord, WeightTag } from '../../types';
import { HistogramShape } from './HistogramShape';
import { NoWeights } from './NoWeights';
import styles from './HistogramsCard.module.css';

export interface HistogramsCardProps {
  run: RunRecord;
  className?: string;
}

interface TagCopy {
  ideal: string;
  sets: string;
  /** Centre of the dashed ideal bell in weight units; undefined when the ideal is not a fixed place. */
  centre?: number;
  batchNorm?: boolean;
}

const COPY: Record<WeightTag, TagCopy> = {
  kernel: {
    ideal: 'Bell at 0 that widens slowly, then stops. Spike at 0 means unused filters.',
    sets: 'Learning rate · Filters · Dense units · Epochs',
    centre: 0,
  },
  gamma: {
    ideal: 'Cluster near 1. Values near 0 mean a channel is switched off.',
    sets: 'Batch norm · Filters',
    centre: 1,
    batchNorm: true,
  },
  beta: {
    ideal: 'Small, near 0. Large negative means the channel is dead after ReLU.',
    sets: 'Batch norm · Learning rate',
    centre: 0,
    batchNorm: true,
  },
  moving_mean: {
    ideal: 'Any value, but the last epochs must overlap.',
    sets: 'Batch norm · Batch size · Epochs',
    batchNorm: true,
  },
  moving_variance: {
    ideal: 'Positive and settled. Near 0 means a dead channel.',
    sets: 'Batch norm · Batch size · Epochs',
    batchNorm: true,
  },
  bias: {
    ideal: 'Narrow, near 0. A run to one side means the learning rate is too high.',
    sets: 'Learning rate',
    centre: 0,
  },
};

const TITLE = 'Histograms over epochs';

/** A compact number for the range under a shape: "−0.7", "1.05", "−18". */
function formatRange(value: number): string {
  const size = Math.abs(value);
  const text = size >= 10 ? value.toFixed(0) : value.toFixed(2);
  return text.replace('-', '−');
}

/** One ridge per kind of weight. The server sends only the final weights, so there is one epoch, the last. */
export function HistogramsCard({ run, className }: HistogramsCardProps) {
  const analysis = run.analysis ?? null;
  const batchNorm = run.settings.batch_norm;
  const tags = analysis === null ? [] : analysis.tags.filter((t) => batchNorm || !COPY[t.tag].batchNorm);

  if (analysis === null || tags.length === 0) {
    return (
      <GlassCard className={cx(styles.card, className)}>
        <h2 className={styles.heading}>{TITLE}</h2>
        <NoWeights />
      </GlassCard>
    );
  }

  return (
    <section className={cx(styles.wrap, className)}>
      <SectionHeading aside="last epoch only">{TITLE}</SectionHeading>
      <ul className={styles.list}>
        {tags.map(({ tag, histogram }) => {
          const copy = COPY[tag];
          const range = `${formatRange(histogram.lo)} to ${formatRange(histogram.hi)}`;
          return (
            <li key={tag} className={styles.row}>
              <div className={styles.shape}>
                <HistogramShape
                  histogram={histogram}
                  variant="ridge"
                  idealCentre={copy.centre}
                  label={`${tag} histogram of the last epoch, range ${range}`}
                />
                <span className={styles.range}>
                  <span>{formatRange(histogram.lo)}</span>
                  <span>{formatRange(histogram.hi)}</span>
                </span>
              </div>
              <div className={styles.text}>
                <Mono tone="text" size="small">
                  {tag}
                </Mono>
                <span className={styles.ideal}>{copy.ideal}</span>
                <Mono tone="accent">{copy.sets}</Mono>
              </div>
            </li>
          );
        })}
      </ul>
      <p className={styles.caption}>
        The server sends only the final weights, so each chart shows the last epoch alone. Dashed is the ideal shape.
        Purple names the settings to change when the shape is off.
        {batchNorm ? '' : ' gamma, beta and both moving charts exist only with batch norm on.'}
      </p>
    </section>
  );
}
