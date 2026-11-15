import type { ReactNode } from 'react';

import { cx } from '../../lib/cx';
import styles from './SectionHeading.module.css';

export interface SectionHeadingProps {
  children: ReactNode;
  /** Small muted text on the right, on the same line. */
  aside?: ReactNode;
  /** A muted line under the heading. */
  note?: ReactNode;
  /** 'accent' is the violet heading of the tablet settings grid. */
  tone?: 'text' | 'accent';
  /** 'inset' adds the 16px side padding that lines the heading up with card text (default). */
  inset?: boolean;
  as?: 'h2' | 'h3';
  className?: string;
}

/** The 13px semibold heading above a group of cards. */
export function SectionHeading({
  children,
  aside,
  note,
  tone = 'text',
  inset = true,
  as: Tag = 'h2',
  className,
}: SectionHeadingProps) {
  return (
    <div className={cx(styles.wrap, inset && styles.inset, className)}>
      <div className={styles.line}>
        <Tag className={cx(styles.heading, tone === 'accent' && styles.accent)}>{children}</Tag>
        {aside != null && <span className={styles.aside}>{aside}</span>}
      </div>
      {note != null && <span className={styles.note}>{note}</span>}
    </div>
  );
}
