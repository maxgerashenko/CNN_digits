import type { ReactNode } from 'react';

import { cx } from '../../lib/cx';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  /** A short violet line: "No runs yet", "Not measured". */
  title: ReactNode;
  /** One or two plain sentences that say what is missing and why. */
  children?: ReactNode;
  /** 'card' = its own glass card (default). 'plain' = for use inside another card. */
  surface?: 'card' | 'plain';
  className?: string;
}

/** What a screen or card shows when it has nothing real to show. Never sample numbers. */
export function EmptyState({ title, children, surface = 'card', className }: EmptyStateProps) {
  return (
    <div className={cx(styles.empty, surface === 'card' && styles.card, className)}>
      <span className={styles.title}>{title}</span>
      {children != null && <span className={styles.text}>{children}</span>}
    </div>
  );
}
