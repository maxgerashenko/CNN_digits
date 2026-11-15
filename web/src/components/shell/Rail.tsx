import { ModeNav } from './ModeNav';
import styles from './Rail.module.css';
import { SavedModelCard } from './SavedModelCard';

/** The left rail of the desktop layout: app name, the two tabs, the app model. */
export function Rail() {
  return (
    <aside className={styles.rail}>
      <h1 className={styles.name}>CNN Digit AI</h1>
      <ModeNav shape="column" />
      <div className={styles.spacer} />
      <SavedModelCard />
    </aside>
  );
}
