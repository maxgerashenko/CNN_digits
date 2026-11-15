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
  /** 'md' = 44px high (phone, panes). 'sm' = 34px high (tablet grid). */
  size?: 'md' | 'sm';
  className?: string;
}

/** A range slider in the accent colour. */
export function Slider({ label, value, min, max, step, onChange, showEnds = false, size = 'md', className }: SliderProps) {
  return (
    <div className={cx(styles.slider, styles[size], className)}>
      {showEnds && <span aria-hidden="true">{min}</span>}
      <input
        type="range"
        className={styles.input}
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number.parseFloat(event.target.value))}
      />
      {showEnds && <span aria-hidden="true">{max}</span>}
    </div>
  );
}
