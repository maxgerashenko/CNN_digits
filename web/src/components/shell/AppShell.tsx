import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useLayoutMode } from '../../hooks/useLayoutMode';
import { cx } from '../../lib/cx';
import { redirectFor, ROUTES, tabFor } from '../../routes';
import { useTrainingStore } from '../../state/trainingStore';
import styles from './AppShell.module.css';
import { Rail } from './Rail';

const APP_NAME = 'Digit recognizer';

/**
 * The outer frame, chosen by the layout:
 *   phone   - the page background; each screen brings its own header and tab bar
 *   tablet  - the wide background; each page brings its header with the tab switch
 *   desktop - the rail on the left, the page's panes on the right
 */
export function AppShell() {
  const mode = useLayoutMode();
  const { pathname } = useLocation();
  const tab = tabFor(pathname);
  // Training has nothing to show while idle: before the first run, and after "Back to settings".
  const idle = useTrainingStore((state) => state.phase === 'idle');

  useEffect(() => {
    document.title = `${tab === 'train' ? 'Train' : 'Recognize'} · ${APP_NAME}`;
  }, [tab]);

  // A screen that is already on the page in this layout has no address of its own.
  const target = redirectFor(pathname, mode) ?? (pathname === ROUTES.training && idle ? ROUTES.train : null);
  if (target) return <Navigate to={target} replace />;

  return (
    <div className={cx(styles.app, styles[mode])} data-layout={mode}>
      {mode === 'desktop' && <Rail />}
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}
