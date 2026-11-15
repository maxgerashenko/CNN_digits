import { cx } from '../../lib/cx';
import styles from './Switch.module.css';

export interface SwitchProps {
  /** Name of the control for screen readers, for example "Batch norm". */
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
  /** 'md' = 52 x 32 (phone, panes). 'sm' = 48 x 28 (tablet grid). */
  size?: 'md' | 'sm';
  className?: string;
}

export function Switch({ label, checked, onChange, size = 'md', className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cx(styles.track, styles[size], checked && styles.on, className)}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.thumb} />
    </button>
  );
}
