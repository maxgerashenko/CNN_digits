import type { ElementType, HTMLAttributes, ReactNode } from 'react';

import { cx } from '../../lib/cx';
import styles from './GlassCard.module.css';

export interface GlassCardProps extends HTMLAttributes<HTMLElement> {
  /** The HTML element to render. Default 'section'. */
  as?: ElementType;
  /** 'card' = 14px 16px (default), 'row' = 12px 16px, 'none' = no padding. */
  padding?: 'card' | 'row' | 'none';
  children?: ReactNode;
}

const PADDING = { card: styles.padCard, row: styles.padRow, none: styles.padNone };

/** The frosted glass surface every card in the design is made of. It sets no layout inside. */
export function GlassCard({ as: Tag = 'section', padding = 'card', className, children, ...rest }: GlassCardProps) {
  return (
    <Tag className={cx(styles.card, PADDING[padding], className)} {...rest}>
      {children}
    </Tag>
  );
}
