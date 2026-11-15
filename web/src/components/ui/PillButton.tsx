import type { MouseEventHandler, ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cx } from '../../lib/cx';
import styles from './PillButton.module.css';

export interface PillButtonProps {
  /**
   * 'primary' = the violet gradient main button, 50px high, full width.
   * 'text'    = text only, 48px high ("Stop training").
   * 'small'   = the 36px "Set 4" button.
   */
  variant?: 'primary' | 'text' | 'small';
  /** Renders a link to this address instead of a button. */
  to?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/** The app's buttons. A disabled primary button turns grey, as on the Training screen. */
export function PillButton({ variant = 'primary', to, onClick, disabled = false, className, children }: PillButtonProps) {
  const classes = cx(styles.button, styles[variant], disabled && styles.disabled, className);
  if (to && !disabled) {
    return (
      <Link className={classes} to={to} onClick={onClick}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
