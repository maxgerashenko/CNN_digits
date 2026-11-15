import { PillButton } from '../../components/ui';
import { useStartTraining } from '../../hooks/useStartTraining';
import { cx } from '../../lib/cx';
import { ROUTES } from '../../routes';
import { useSettingsStore } from '../../state/settingsStore';
import type { Settings } from '../../types';
import styles from './StartTrainingButton.module.css';

export interface StartTrainingButtonProps {
  className?: string;
  label?: string;
  changes?: Partial<Settings>;
  /** A muted line under the button that says what it is for. */
  hint?: string;
  /** Instead of starting a run: put `changes` into the form and open this address. */
  applyAndOpen?: string;
}

/** The main button of the Train tab. While a run is in progress it opens the Training screen. */
export function StartTrainingButton({
  className,
  label = 'Start training',
  changes,
  hint,
  applyAndOpen,
}: StartTrainingButtonProps) {
  const { start, disabled, busy, note } = useStartTraining();
  const applySettings = useSettingsStore((state) => state.applySettings);

  return (
    <div className={cx(styles.wrap, className)}>
      {note && (
        <p className={styles.note} role="status">
          {note}
        </p>
      )}
      {busy ? (
        <PillButton to={ROUTES.training}>Training, view progress</PillButton>
      ) : applyAndOpen ? (
        <PillButton to={applyAndOpen} onClick={() => changes && applySettings(changes)}>
          {label}
        </PillButton>
      ) : (
        <PillButton disabled={disabled} onClick={() => start(changes)}>
          {label}
        </PillButton>
      )}
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
