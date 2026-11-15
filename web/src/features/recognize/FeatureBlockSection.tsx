import { PixelGrid } from '../../components/ui';
import { cx } from '../../lib/cx';
import type { FeatureMapSet, ModelBlock } from '../../model/modelLoader';
import { DRAW_PROMPT } from './reading';
import styles from './FeatureBlockSection.module.css';

export interface FeatureBlockSectionProps {
  block: ModelBlock;
  /** What the block saw; null when nothing is drawn (the maps are then empty). */
  maps: FeatureMapSet | null;
  /** The step number shown before the name: "02". */
  step: string;
  /** 'screen' = phone and pane (separators, 15 px title). 'card' = tablet card (denser). */
  variant?: 'screen' | 'card';
  className?: string;
}

const WHAT_IT_FINDS = ['strokes and edges', 'corners and loops', 'parts of digits'];
const WHAT_IT_MEANS = [
  'A bright cell means that filter found its pattern there.',
  'Smaller picture, bigger patterns.',
  'Smallest picture, the biggest patterns.',
];

/** One conv block of the active model: spec line, title, up to 8 feature maps, a note. */
export function FeatureBlockSection({ block, maps, step, variant = 'screen', className }: FeatureBlockSectionProps) {
  const shown = Math.min(block.filters, 8);
  const side = block.outSize;
  const kind = Math.min(block.index, 3) - 1;
  const count = shown >= block.filters ? `All ${block.filters} maps` : `${shown} of ${block.filters} maps`;
  const size = variant === 'card' ? '.' : `, each ${side} × ${side}.`;
  const note = `${count}${size} ${maps ? WHAT_IT_MEANS[kind] : DRAW_PROMPT}`;

  return (
    <section className={cx(styles.section, styles[variant], className)} aria-label={`Conv block ${block.index}`}>
      <div className={styles.head}>
        <span className={styles.step}>
          {step} Conv block {block.index}
        </span>
        <span className={styles.spec}>
          {block.convLayers} × conv {block.kernel}×{block.kernel} · pool · {block.inSize} → {block.outSize}
        </span>
      </div>
      <h2 className={styles.title}>
        {block.filters} filters find {WHAT_IT_FINDS[kind]}
      </h2>
      <div className={styles.maps}>
        {Array.from({ length: shown }, (_, i) => (
          <div key={i} className={styles.map}>
            <PixelGrid
              data={maps?.maps[i] ?? null}
              size={side}
              ramp="violet"
              normalize
              label={`Feature map, ${side} by ${side}`}
            />
          </div>
        ))}
      </div>
      <p className={styles.note}>{note}</p>
    </section>
  );
}
