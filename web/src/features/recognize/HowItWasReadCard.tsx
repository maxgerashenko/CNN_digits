import { GlassCard, EmptyState } from '../../components/ui';
import { cx } from '../../lib/cx';
import { FeatureBlockSection } from './FeatureBlockSection';
import { noModelText, stepLabel, useReading } from './reading';
import styles from './HowItWasReadCard.module.css';

export interface HowItWasReadCardProps {
  className?: string;
}

/** Tablet column 2: the conv blocks of the active model as one card that fills the column. */
export function HowItWasReadCard({ className }: HowItWasReadCardProps) {
  const { model, modelStatus, result } = useReading();
  return (
    <GlassCard className={cx(styles.card, className)} aria-labelledby="how-read-title">
      <h2 id="how-read-title" className={styles.heading}>
        How it was read
      </h2>
      {model ? (
        model.info.blocks.map((block) => (
          <FeatureBlockSection
            key={block.index}
            block={block}
            maps={result?.maps.find((m) => m.block === block.index) ?? null}
            step={stepLabel(block.index)}
            variant="card"
          />
        ))
      ) : (
        <EmptyState title="No model" surface="plain">
          {noModelText(modelStatus)}
        </EmptyState>
      )}
    </GlassCard>
  );
}
