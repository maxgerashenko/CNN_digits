import { cx } from '../../lib/cx';
import styles from './SegmentedControl.module.css';

export interface SegmentOption<T extends string | number> {
  value: T;
  /** The text on the segment. */
  label: string;
}

export interface SegmentedControlProps<T extends string | number> {
  /** Name of the control for screen readers, for example "Kernel size". */
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange(value: T): void;
  /** 'md' = 40px segments (phone, panes). 'sm' = 30px segments (tablet grid). */
  size?: 'md' | 'sm';
  className?: string;
}

/** A row of equal segments; one is selected. */
export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className={cx(styles.track, styles[size], className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={selected}
            className={cx(styles.segment, selected && styles.selected)}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
