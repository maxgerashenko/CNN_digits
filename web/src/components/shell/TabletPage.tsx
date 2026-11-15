import type { ReactNode } from 'react';

import { ModeNav } from './ModeNav';
import styles from './TabletPage.module.css';

export interface TabletPageProps {
  /** The heading on the left of the header: "Recognize", "Train". */
  title: string;
  /** The columns. Each child is one column; the page gives them the full height. */
  children: ReactNode;
}

/**
 * The frame of the tablet layout: a 72px header with the title and the
 * Recognize / Train switch, and under it one row of columns that fills the
 * rest of the window. The page itself never scrolls.
 */
export function TabletPage({ title, children }: TabletPageProps) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        <ModeNav shape="pill" />
      </header>
      <main className={styles.columns}>{children}</main>
    </div>
  );
}
