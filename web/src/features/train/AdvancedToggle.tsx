import { ChevronRightIcon } from '../../components/ui';
import styles from './AdvancedToggle.module.css';

export interface AdvancedToggleProps {
  open: boolean;
  /** How many settings are behind the row. */
  count: number;
  onToggle(): void;
}

/** The "Advanced settings" row: "4 more" when closed, "Hide" when open. */
export function AdvancedToggle({ open, count, onToggle }: AdvancedToggleProps) {
  return (
    <button type="button" className={styles.toggle} aria-expanded={open} onClick={onToggle}>
      <span>Advanced settings</span>
      <span className={styles.state}>
        {open ? 'Hide' : `${count} more`}
        <ChevronRightIcon className={styles.chevron} />
      </span>
    </button>
  );
}
