import { cx } from '../../lib/cx';
import styles from './Stepper.module.css';

export interface StepperProps {
  /** Name of the control for screen readers, for example "Epochs". */
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(value: number): void;
  /** 'md' = compact, 44 x 40 buttons (phone, panes). 'sm' = full width, 34px high (tablet grid). */
  size?: 'md' | 'sm';
  className?: string;
}

/** A number with a minus and a plus button. The buttons switch off at the limits. */
export function Stepper({ label, value, min, max, step = 1, onChange, size = 'md', className }: StepperProps) {
  return (
    <div role="group" aria-label={label} className={cx(styles.stepper, styles[size], className)}>
      <button
        type="button"
        className={styles.button}
        aria-label={`${label}: less`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        −
      </button>
      <span className={styles.value} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={styles.button}
        aria-label={`${label}: more`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
      >
        +
      </button>
    </div>
  );
}
