import type { CSSProperties } from 'react';

import { cx } from '../../lib/cx';
import styles from './Slider.module.css';

export interface SliderProps {
  /** Name of the control for screen readers, for example "Dropout". */
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(value: number): void;
  /** Shows the smallest and largest value at the ends, as on the phone. */
  showEnds?: boolean;
  /** A value to mark on the track as the optimal one, with its number under the mark. */
  mark?: number;
  /** 'md' = 44px high (phone, panes). 'sm' = 34px high (tablet grid). */
  size?: 'md' | 'sm';
  className?: string;
}

/** A range slider in the accent colour. */
export function Slider({ label, value, min, max, step, onChange, showEnds = false, mark, size = 'md', className }: SliderProps) {
  const marked = mark !== undefined && mark >= min && mark <= max;
  return (
    <div className={cx(styles.slider, styles[size], className)}>
      {showEnds && <span aria-hidden="true">{min}</span>}
      <div className={styles.track}>
        <input
          type="range"
          className={styles.input}
          aria-label={label}
          aria-description={marked ? `Optimal: ${mark}` : undefined}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number.parseFloat(event.target.value))}
        />
        {marked && (
          <span
            className={cx(styles.mark, value === mark && styles.markOn)}
            style={{ '--mark-at': (mark - min) / (max - min) } as CSSProperties}
            data-testid="slider-mark"
          >
            optimal {mark}
          </span>
        )}
      </div>
      {showEnds && <span aria-hidden="true">{max}</span>}
    </div>
  );
}
