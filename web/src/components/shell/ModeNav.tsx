import { Link, useLocation } from 'react-router-dom';

import { cx } from '../../lib/cx';
import { ROUTES, tabFor } from '../../routes';
import { RecognizeIcon, TrainIcon } from '../ui/icons';
import styles from './ModeNav.module.css';

export interface ModeNavProps {
  /**
   * 'pill'   = the two tabs side by side in a dark pill (phone tab bar, tablet header).
   * 'column' = the two tabs under each other (desktop rail).
   */
  shape: 'pill' | 'column';
  className?: string;
}

const TABS = [
  { id: 'recognize', label: 'Recognize', to: ROUTES.recognize, Icon: RecognizeIcon },
  { id: 'train', label: 'Train', to: ROUTES.train, Icon: TrainIcon },
] as const;

/** The Recognize / Train switch. The same component in all three layouts. */
export function ModeNav({ shape, className }: ModeNavProps) {
  const active = tabFor(useLocation().pathname);
  return (
    <nav aria-label="Mode" className={cx(styles.nav, styles[shape], className)}>
      {TABS.map(({ id, label, to, Icon }) => (
        <Link
          key={id}
          to={to}
          aria-current={active === id ? 'page' : undefined}
          className={cx(styles.tab, active === id && styles.active)}
        >
          <Icon />
          {label}
        </Link>
      ))}
    </nav>
  );
}
