import type { ElementType, HTMLAttributes, ReactNode } from 'react';

import { cx } from '../../lib/cx';
import styles from './ListCard.module.css';

export interface ListCardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  children?: ReactNode;
}

/** A glass card that holds rows stacked on top of each other (setting groups, lists, tables). */
export function ListCard({ as: Tag = 'div', className, children, ...rest }: ListCardProps) {
  return (
    <Tag className={cx(styles.list, className)} {...rest}>
      {children}
    </Tag>
  );
}

export interface ListRowProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  /** 'between' puts the first child left and the last right (default). 'stack' stacks the children. */
  layout?: 'between' | 'stack';
  children?: ReactNode;
}

/** One row of a ListCard: 10px 16px padding. */
export function ListRow({ as: Tag = 'div', layout = 'between', className, children, ...rest }: ListRowProps) {
  return (
    <Tag className={cx(styles.row, styles[layout], className)} {...rest}>
      {children}
    </Tag>
  );
}
