import type { ReactNode } from 'react';

import { PaneProvider } from '../../hooks/usePane';
import styles from './Panes.module.css';

/** The row of side-by-side panes of the desktop layout. */
export function Panes({ children }: { children: ReactNode }) {
  return <div className={styles.panes}>{children}</div>;
}

export interface PaneProps {
  /** Name of the pane for screen readers: "Settings", "Run details", ... */
  label: string;
  children: ReactNode;
}

/** One pane: a phone-style screen in its own scrolling column. */
export function Pane({ label, children }: PaneProps) {
  return (
    <section aria-label={label} className={styles.pane}>
      <PaneProvider>{children}</PaneProvider>
    </section>
  );
}
