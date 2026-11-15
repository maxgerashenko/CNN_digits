import { cx } from '../../lib/cx';
import { useModelStore } from '../../state/modelStore';
import type { ModelSource } from '../../types';
import styles from './ModelPills.module.css';

export interface ModelPillsProps {
  className?: string;
}

const PILLS: { source: ModelSource; label: string }[] = [
  { source: 'saved', label: 'App model' },
  { source: 'retrained', label: 'My trained' },
];

/** Picks which model reads the drawing. "My trained" waits for a finished run. */
export function ModelPills({ className }: ModelPillsProps) {
  const active = useModelStore((s) => s.active);
  const retrainedReady = useModelStore((s) => s.retrained.status === 'ready');
  const setActive = useModelStore((s) => s.setActive);

  return (
    <div role="group" aria-label="Model" className={cx(styles.pills, className)}>
      {PILLS.map(({ source, label }) => {
        const pressed = active === source;
        const disabled = source === 'retrained' && !retrainedReady;
        return (
          <button
            key={source}
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            className={cx(styles.pill, pressed && styles.on)}
            onClick={() => setActive(source)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
