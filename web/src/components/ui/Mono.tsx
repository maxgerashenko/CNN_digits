import type { ElementType, HTMLAttributes, ReactNode } from 'react';

import { cx } from '../../lib/cx';
import styles from './Mono.module.css';

export type Tone = 'text' | 'muted' | 'dim' | 'accent' | 'ok' | 'warn';

export interface MonoProps extends HTMLAttributes<HTMLElement> {
  /** Colour. 'ok' is green, 'warn' is yellow, 'accent' is the violet label colour. Default 'muted'. */
  tone?: Tone;
  /** 'tiny' 10px, 'label' 11px (default), 'hint' 12px, 'small' 13px, 'button' 16px. */
  size?: 'tiny' | 'label' | 'hint' | 'small' | 'button';
  as?: ElementType;
  children?: ReactNode;
}

/**
 * Text in Geist Mono: step labels ("01 Input"), specs, values and the
 * status words ("ok", "improve", "keep", "later", "on track", "MEASURED").
 */
export function Mono({ tone = 'muted', size = 'label', as: Tag = 'span', className, children, ...rest }: MonoProps) {
  return (
    <Tag className={cx(styles.mono, styles[`tone-${tone}`], styles[`size-${size}`], className)} {...rest}>
      {children}
    </Tag>
  );
}
