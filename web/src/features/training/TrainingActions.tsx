import { useNavigate } from 'react-router-dom';

import { PillButton } from '../../components/ui';
import { cx } from '../../lib/cx';
import { ROUTES } from '../../routes';
import { useModelStore } from '../../state/modelStore';
import { isBusy, useTrainingStore } from '../../state/trainingStore';
import styles from './TrainingActions.module.css';

export interface TrainingActionsProps {
  className?: string;
}

/** Use the new model once the run is done; stop while it runs; back to settings after that. */
export function TrainingActions({ className }: TrainingActionsProps) {
  const navigate = useNavigate();
  const phase = useTrainingStore((s) => s.phase);
  const stop = useTrainingStore((s) => s.stop);
  const reset = useTrainingStore((s) => s.reset);
  const setActive = useModelStore((s) => s.setActive);

  const busy = isBusy(phase);

  return (
    <div className={cx(styles.root, className)}>
      <PillButton
        disabled={phase !== 'done'}
        onClick={() => {
          setActive('retrained');
          navigate(ROUTES.recognize);
        }}
      >
        Use my retrained model
      </PillButton>
      {busy ? (
        <PillButton
          variant="text"
          onClick={() => {
            stop();
            navigate(ROUTES.train);
          }}
        >
          Stop training
        </PillButton>
      ) : (
        <PillButton variant="text" to={ROUTES.train} onClick={() => reset()}>
          Back to settings
        </PillButton>
      )}
    </div>
  );
}
