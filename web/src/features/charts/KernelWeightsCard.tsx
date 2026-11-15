import { GlassCard, EmptyState, Mono } from '../../components/ui';
import { cx } from '../../lib/cx';
import { selectLatestRun, useTrainingStore } from '../../state/trainingStore';
import { HistogramShape } from './HistogramShape';
import styles from './KernelWeightsCard.module.css';

export interface KernelWeightsCardProps {
  className?: string;
}

const TITLE = 'Kernel weights per layer';

/** One small histogram per layer, worked out in the browser from the retrained model's weights. */
export function KernelWeightsCard({ className }: KernelWeightsCardProps) {
  const analysis = useTrainingStore((s) => selectLatestRun(s)?.analysis ?? null);

  if (analysis === null || analysis.layers.length === 0) {
    return (
      <GlassCard className={cx(styles.card, className)}>
        <h2 className={styles.heading}>{TITLE}</h2>
        <EmptyState surface="plain" title="Not measured">
          The weights of the trained model are not available, so there is nothing to draw yet. Finish a training run first.
        </EmptyState>
      </GlassCard>
    );
  }

  const chip =
    analysis.denseBell === null ? null : analysis.denseBell ? (
      <Mono tone="ok">ok</Mono>
    ) : (
      <Mono tone="warn">improve</Mono>
    );

  return (
    <GlassCard className={cx(styles.card, className)}>
      <div className={styles.top}>
        <h2 className={styles.heading}>{TITLE}</h2>
        {chip}
      </div>
      <ul className={styles.grid}>
        {analysis.layers.map((layer) => (
          <li key={layer.name} className={styles.cell}>
            <HistogramShape
              histogram={layer.histogram}
              variant="line"
              idealCentre={0}
              label={`${layer.name} weights, from ${layer.histogram.lo.toFixed(2)} to ${layer.histogram.hi.toFixed(2)}`}
            />
            <Mono>{layer.name}</Mono>
          </li>
        ))}
      </ul>
      <p className={styles.text}>
        Ideal: a smooth bell around 0 in every layer. A spike at 0 means dead filters. A very wide shape means unstable
        training.
      </p>
    </GlassCard>
  );
}
