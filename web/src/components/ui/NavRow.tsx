import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cx } from '../../lib/cx';
import { ChevronRightIcon } from './icons';
import styles from './NavRow.module.css';

export interface NavRowProps {
  /** Where the row leads. */
  to: string;
  title: ReactNode;
  /** A muted second line. */
  subtitle?: ReactNode;
  /** A small violet line above the title ("Last run"). */
  eyebrow?: ReactNode;
  /** 'card' = its own glass card (default). 'plain' = a row inside a ListCard. */
  surface?: 'card' | 'plain';
  className?: string;
}

/** A link row with a chevron on the right: "How it was read", "Raw charts", "All metrics". */
export function NavRow({ to, title, subtitle, eyebrow, surface = 'card', className }: NavRowProps) {
  const tall = subtitle != null || eyebrow != null;
  return (
    <Link to={to} className={cx(styles.row, surface === 'card' && styles.card, tall && styles.tall, className)}>
      <span className={styles.text}>
        {eyebrow != null && <span className={styles.eyebrow}>{eyebrow}</span>}
        <span className={styles.title}>{title}</span>
        {subtitle != null && <span className={styles.subtitle}>{subtitle}</span>}
      </span>
      <ChevronRightIcon className={styles.chevron} />
    </Link>
  );
}
