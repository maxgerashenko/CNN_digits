import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useLayoutMode } from '../../hooks/useLayoutMode';
import { useInPane } from '../../hooks/usePane';
import { usePullToReload } from '../../hooks/usePullToReload';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import { cx } from '../../lib/cx';
import { ChevronLeftIcon } from '../ui/icons';
import styles from './Screen.module.css';

/** The spokes of the pull-to-reload spinner, drawn like the iPhone's. */
const SPOKES = [0, 1, 2, 3, 4, 5, 6, 7];

export interface ScreenProps {
  /** The heading of the screen: "CNN Digit AI", "Train", "Training", ... */
  title: string;
  /**
   * 'root'   = large left title. With `backTo`, a back button before the title.
   * 'pushed' = a screen opened from another: small centred title and a back
   *            button.
   */
  variant: 'root' | 'pushed';
  /** Where the back button leads, and its name for screen readers. A pane has no back button. */
  backTo?: string;
  backLabel?: string;
  /** Phone: blocks that stay at the top of the window while the rest scrolls. */
  pinned?: ReactNode;
  /** Phone: the title row stays at the top too. Without it only `pinned` stays. */
  pinTitle?: boolean;
  /** Phone: class for the box that holds the pinned blocks, for example to keep its height fixed. */
  pinnedClassName?: string;
  /**
   * Phone: the box of the pinned blocks keeps the largest height the blocks
   * have had. Blocks that turn small after a scroll then free room, and the
   * rest of the screen does not jump.
   */
  pinnedReserve?: boolean;
  /** Kept at the bottom of the window while the screen scrolls: the main button. */
  footer?: ReactNode;
  /** Phone: slides the footer out of the window. */
  footerHidden?: boolean;
  /** Phone: the footer lies over the end of the screen and adds nothing to its scroll length. */
  footerOverlay?: boolean;
  /** Phone: the screen stops at marked blocks when a scroll ends near them. */
  snap?: boolean;
  /** Phone: pulling the screen down from its top reloads the app. */
  pullToReload?: boolean;
  /** Phone: called with how far the screen is scrolled, in px. */
  onScrollTop?: (top: number) => void;
  /** Space between the blocks of the screen in px. Default 14. */
  gap?: number;
  className?: string;
  children: ReactNode;
}

/**
 * The frame of every phone-style screen: title row, the blocks in one
 * column, and the part that stays at the bottom.
 *
 * On a phone the screen is as high as the window and scrolls inside. A
 * pushed screen goes back with its back button or with a swipe to the right.
 * The same screen also works as a pane of the desktop layout and as a full
 * page on a tablet; there the pinned blocks are ordinary blocks, and a pane
 * has no back button.
 *
 * The children are direct flex items of the column, so one of them can take
 * the free height with `flex-grow: 1`.
 */
export function Screen({
  title,
  variant,
  backTo,
  backLabel,
  pinned,
  pinTitle = false,
  pinnedClassName,
  pinnedReserve = false,
  footer,
  footerHidden = false,
  footerOverlay = false,
  snap = false,
  pullToReload = false,
  onScrollTop,
  gap = 14,
  className,
  children,
}: ScreenProps) {
  const inPane = useInPane();
  const mode = useLayoutMode();
  const phone = mode === 'phone' && !inPane;
  const showBack = !inPane && backTo !== undefined;
  const hasFooter = footer != null;
  const Title = inPane ? 'h2' : 'h1';

  const scroller = useRef<HTMLDivElement>(null);
  useSwipeBack(scroller, phone && showBack ? backTo : undefined);
  const pull = usePullToReload(scroller, phone && pullToReload);

  // The largest height the pinned blocks have had, kept as the height of their box.
  const pinnedInner = useRef<HTMLDivElement>(null);
  const [reserved, setReserved] = useState(0);
  useEffect(() => {
    const inner = pinnedInner.current;
    if (!phone || !pinnedReserve || !inner || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setReserved((was) => Math.max(was, inner.offsetHeight)));
    observer.observe(inner);
    return () => observer.disconnect();
  }, [phone, pinnedReserve]);

  const header = (
    <header className={cx(styles.header, styles[variant])}>
      {showBack && (
        <Link to={backTo} aria-label={backLabel ?? 'Back'} className={styles.back}>
          <ChevronLeftIcon />
        </Link>
      )}
      <Title className={styles.title}>{title}</Title>
    </header>
  );

  const hasPinned = pinned != null || (phone && pinTitle);

  return (
    <div
      ref={scroller}
      className={cx(
        styles.screen,
        inPane && styles.inPane,
        phone && styles.phone,
        // No snapping while the spinner is open: it would scroll the spinner out of sight.
        phone && snap && pull.height === 0 && styles.snap,
        hasFooter && styles.withFooter,
        className,
      )}
      style={{ '--screen-gap': `${gap}px` } as CSSProperties}
      onScroll={phone && onScrollTop ? (event) => onScrollTop(event.currentTarget.scrollTop) : undefined}
    >
      {phone && pullToReload && (
        <div
          className={cx(styles.pull, !pull.dragging && styles.pullSettle)}
          style={{ height: pull.height }}
          aria-hidden="true"
        >
          <svg className={cx(styles.spinner, pull.reloading && styles.spinning)} width="28" height="28" viewBox="0 0 28 28">
            {SPOKES.map((spoke) => (
              <rect
                key={spoke}
                x="12.75"
                y="3"
                width="2.5"
                height="7"
                rx="1.25"
                fill="currentColor"
                transform={`rotate(${spoke * (360 / SPOKES.length)} 14 14)`}
                // The spokes appear one after another as the pull grows; each is a little lighter than the one before.
                opacity={pull.progress * SPOKES.length > spoke ? 1 - (spoke / SPOKES.length) * 0.7 : 0}
              />
            ))}
          </svg>
        </div>
      )}
      {!(phone && pinTitle) && header}
      {hasPinned &&
        (phone ? (
          <div
            className={cx(styles.pinned, pinTitle && styles.pinnedFirst, pinnedClassName)}
            style={pinnedReserve && reserved > 0 ? { height: reserved } : undefined}
          >
            <div ref={pinnedInner} className={styles.pinnedInner}>
              <div className={styles.backdrop} aria-hidden="true" />
              {pinTitle && header}
              {pinned}
            </div>
          </div>
        ) : (
          pinned
        ))}
      {children}
      {hasFooter && (
        <div
          className={cx(styles.footer, phone && footerOverlay && styles.footerOverlay, phone && footerHidden && styles.footerHidden)}
          inert={phone && footerHidden}
        >
          {phone && footerOverlay ? (
            <div className={styles.footerOverlayClip}>
              <div className={styles.footerOverlayInner}>{footer}</div>
            </div>
          ) : (
            footer
          )}
        </div>
      )}
    </div>
  );
}
