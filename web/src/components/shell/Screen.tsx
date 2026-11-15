import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useLayoutMode } from '../../hooks/useLayoutMode';
import { useInPane } from '../../hooks/usePane';
import { cx } from '../../lib/cx';
import { ChevronLeftIcon } from '../ui/icons';
import { ModeNav } from './ModeNav';
import styles from './Screen.module.css';

export interface ScreenProps {
  /** The heading of the screen: "Recognize", "How it was read", ... */
  title: string;
  /**
   * 'root'   = one of the two tab screens: large left title, and the tab bar
   *            at the bottom on a phone.
   * 'pushed' = a screen opened from another: small centred title and a back
   *            button, no tab bar.
   */
  variant: 'root' | 'pushed';
  /** Pushed screens: where the back button leads, and its name for screen readers. */
  backTo?: string;
  backLabel?: string;
  /** Kept at the bottom of the window while the screen scrolls: the main button. */
  footer?: ReactNode;
  /** Space between the blocks of the screen in px. Default 14. */
  gap?: number;
  className?: string;
  children: ReactNode;
}

/**
 * The frame of every phone-style screen: title row, the blocks in one
 * column, and the part that stays at the bottom. The same screen works as a
 * full page (phone, and Raw charts on a tablet) and as a pane of the
 * desktop layout, where the back button and the tab bar are left out.
 *
 * The children are direct flex items of the column, so one of them can take
 * the free height with `flex-grow: 1`.
 */
export function Screen({ title, variant, backTo, backLabel, footer, gap = 14, className, children }: ScreenProps) {
  const inPane = useInPane();
  const mode = useLayoutMode();
  const showTabs = variant === 'root' && mode === 'phone' && !inPane;
  const showBack = variant === 'pushed' && !inPane && backTo !== undefined;
  const hasFooter = footer != null || showTabs;
  const Title = inPane ? 'h2' : 'h1';

  return (
    <div
      className={cx(styles.screen, inPane && styles.inPane, hasFooter && styles.withFooter, className)}
      style={{ '--screen-gap': `${gap}px` } as CSSProperties}
    >
      <header className={cx(styles.header, styles[variant])}>
        {showBack && (
          <Link to={backTo} aria-label={backLabel ?? 'Back'} className={styles.back}>
            <ChevronLeftIcon />
          </Link>
        )}
        <Title className={styles.title}>{title}</Title>
      </header>
      {children}
      {hasFooter && (
        <div className={cx(styles.footer, showTabs && styles.footerTabs)}>
          {footer}
          {showTabs && (
            <div className={styles.tabs}>
              <ModeNav shape="pill" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
