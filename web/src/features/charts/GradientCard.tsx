import type { CSSProperties } from 'react';

import { EmptyState, GlassCard, Mono } from '../../components/ui';
import { cx } from '../../lib/cx';
import type { RunRecord } from '../../types';
import { GRADIENT_IDEAL, gradientPosition, gradientVerdict, lastGradients } from '../../lib/gradients';
import styles from './GradientCard.module.css';

export interface GradientCardProps {
  run: RunRecord;
  className?: string;
}

const BAND = {
  '--band-left': `${gradientPosition(GRADIENT_IDEAL.min)}%`,
  '--band-width': `${gradientPosition(GRADIENT_IDEAL.max) - gradientPosition(GRADIENT_IDEAL.min)}%`,
} as CSSProperties;

/** One dot per layer: how large its gradient was after the last epoch, against the ideal band. */
export function GradientCard({ run, className }: GradientCardProps) {
  const gradients = lastGradients(run);
  const layers = gradients ? Object.entries(gradients) : [];

  if (layers.length === 0) {
    return (
      <GlassCard className={cx(styles.card, className)}>
        <h2 className={styles.heading}>Gradient size per layer</h2>
        <EmptyState surface="plain" title="Not measured">
          The training server did not send gradient sizes for this run, so no dots are drawn.
        </EmptyState>
      </GlassCard>
    );
  }

  const outside = layers.filter(([, size]) => gradientVerdict(size) !== 'ideal');
  const label =
    outside.length === 0
      ? 'Gradient size for each layer; all sit inside the ideal band'
      : `Gradient size for each layer; outside the ideal band: ${outside.map(([name, size]) => `${name} is ${gradientVerdict(size)}`).join(', ')}`;

  return (
    <GlassCard className={cx(styles.card, className)}>
      <div className={styles.top}>
        <h2 className={styles.heading}>Gradient size per layer</h2>
        {outside.length === 0 ? <Mono tone="ok">ok</Mono> : <Mono tone="warn">improve</Mono>}
      </div>
      <div role="img" aria-label={label} className={styles.rows} style={BAND}>
        {layers.map(([name, size]) => (
          <div key={name} className={styles.row} title={`${name}: ${size.toExponential(1)}`}>
            <Mono className={styles.name}>{name}</Mono>
            <div className={styles.track}>
              <div className={styles.band} />
              <div
                className={cx(styles.dot, gradientVerdict(size) !== 'ideal' && styles.dotOutside)}
                style={{ '--x': `${gradientPosition(size)}%` } as CSSProperties}
                data-testid={`gradient-dot-${name}`}
              />
            </div>
          </div>
        ))}
      </div>
      <div className={styles.axis} aria-hidden="true">
        <Mono>vanishing</Mono>
        <Mono>ideal band</Mono>
        <Mono>exploding</Mono>
      </div>
      <p className={styles.text}>
        Ideal: every dot inside the band. Far left, early layers stop learning. Far right, lower the learning rate or
        turn batch norm on.
      </p>
    </GlassCard>
  );
}
