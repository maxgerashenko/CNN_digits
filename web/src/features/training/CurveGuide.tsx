import type { ReactNode } from 'react';

import { ListCard, ListRow } from '../../components/ui';
import { cx } from '../../lib/cx';
import styles from './CurveGuide.module.css';

export interface CurveGuideProps {
  className?: string;
}

interface Case {
  title: string;
  fix: string;
  drawing: ReactNode;
}

const CASES: Case[] = [
  {
    title: 'Jumps up and down',
    fix: 'Learning rate too high. Lower it.',
    drawing: <path className={styles.now} d="M2 20 8 8l5 9 5-12 5 11 5-10 5 9 5-8" />,
  },
  {
    title: 'Barely moves',
    fix: 'Learning rate too low. Raise it or add epochs.',
    drawing: <path className={styles.now} d="M2 20C14 19 28 18 42 17" />,
  },
  {
    title: 'Flattens far below the goal',
    fix: 'Network too small. Add a block or more filters.',
    drawing: (
      <>
        <path className={styles.goal} d="M2 3.5h40" />
        <path className={styles.now} d="M2 20C6 13 12 12 20 12h22" />
      </>
    ),
  },
  {
    title: 'Good in training, worse on the test',
    fix: 'Overfitting. Raise dropout or turn on augmentation.',
    drawing: (
      <>
        <path className={styles.now} d="M2 20C8 8 18 5 42 4" />
        <path className={styles.ideal} strokeDasharray="3 3" d="M2 20C8 11 16 9 24 10s12 4 18 7" />
      </>
    ),
  },
];

/** "If the curve looks different": four shapes to watch for and what to change. */
export function CurveGuide({ className }: CurveGuideProps) {
  return (
    <section className={cx(styles.root, className)}>
      <h2 className={styles.heading}>If the curve looks different</h2>
      <ListCard as="ul" className={styles.list}>
        {CASES.map((item) => (
          <ListRow as="li" key={item.title} className={styles.row}>
            <svg aria-hidden="true" className={styles.drawing} viewBox="0 0 44 24">
              {item.drawing}
            </svg>
            <span className={styles.text}>
              <span className={styles.title}>{item.title}</span>
              <span className={styles.fix}>{item.fix}</span>
            </span>
          </ListRow>
        ))}
      </ListCard>
    </section>
  );
}
