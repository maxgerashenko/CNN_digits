import { useNavigate } from 'react-router-dom';

import { PillButton } from '../../components/ui';
import { useInPane } from '../../hooks/usePane';
import { cx } from '../../lib/cx';
import { ROUTES } from '../../routes';
import { useModelStore } from '../../state/modelStore';
import { isBusy, useTrainingStore } from '../../state/trainingStore';
import styles from './TrainingActions.module.css';

export interface TrainingActionsProps {
  className?: string;
}

/**
 * The buttons of the Training screen.
 *   while the run is in progress: Stop training
 *   when it is done:              Use trained model, Analyze (in a desktop pane, where
 *                                 Analysis is next to it: Back to settings)
 *   stopped or failed:            Back to settings
 */
export function TrainingActions({ className }: TrainingActionsProps) {
  const navigate = useNavigate();
  const inPane = useInPane();
  const phase = useTrainingStore((s) => s.phase);
  const stop = useTrainingStore((s) => s.stop);
  const reset = useTrainingStore((s) => s.reset);
  const setActive = useModelStore((s) => s.setActive);

  if (isBusy(phase)) {
    return (
      <div className={cx(styles.root, className)}>
        <PillButton
          variant="secondary"
          onClick={() => {
            stop();
            navigate(ROUTES.train);
          }}
        >
          Stop training
        </PillButton>
        <p className={styles.note}>No need to wait if the training doesn't look good.</p>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className={cx(styles.root, className)}>
        <PillButton
          onClick={() => {
            setActive('retrained');
            navigate(ROUTES.recognize);
          }}
        >
          Use trained model
        </PillButton>
        {inPane ? (
          <PillButton variant="secondary" to={ROUTES.train} onClick={() => reset()}>
            Back to settings
          </PillButton>
        ) : (
          <>
            <PillButton variant="secondary" to={ROUTES.details}>
              Analyze
            </PillButton>
            <p className={styles.note}>You can retrain your model.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={cx(styles.root, className)}>
      <PillButton variant="secondary" to={ROUTES.train} onClick={() => reset()}>
        Back to settings
      </PillButton>
    </div>
  );
}
