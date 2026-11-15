import { PillButton } from '../../components/ui';
import { useStartTraining } from '../../hooks/useStartTraining';
import { cx } from '../../lib/cx';
import { ROUTES } from '../../routes';
import type { Settings } from '../../types';
import styles from './StartTrainingButton.module.css';

export interface StartTrainingButtonProps {
  className?: string;
  label?: string;
  changes?: Partial<Settings>;
}

/** The main button of the Train tab. While a run is in progress it opens the Training screen. */
export function StartTrainingButton({ className, label = 'Start training', changes }: StartTrainingButtonProps) {
  const { start, disabled, busy, note } = useStartTraining();

  return (
    <div className={cx(styles.wrap, className)}>
      {note && (
        <p className={styles.note} role="status">
          {note}
        </p>
      )}
      {busy ? (
        <PillButton to={ROUTES.training}>Training, view progress</PillButton>
      ) : (
        <PillButton disabled={disabled} onClick={() => start(changes)}>
          {label}
        </PillButton>
      )}
    </div>
  );
}
