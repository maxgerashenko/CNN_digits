import { useNavigate } from 'react-router-dom';

import { PillButton } from '../../components/ui';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { useInPane } from '../../hooks/usePane';
import { useRunChecks } from '../../hooks/useRunChecks';
import { checksInBucket } from '../../lib/checks';
import { cx } from '../../lib/cx';
import { ROUTES } from '../../routes';
import { useModelStore } from '../../state/modelStore';
import { StartTrainingButton } from '../train/StartTrainingButton';
import styles from './RetrainFooter.module.css';

export interface RetrainFooterProps {
  className?: string;
}

/**
 * The buttons at the end of Analysis: use the trained model, and retrain with
 * the first suggested change. On a phone "Retrain" puts the change into the
 * form and opens the Train settings; in a pane, where the form is next to
 * it, it starts the run.
 */
export function RetrainFooter({ className }: RetrainFooterProps) {
  const navigate = useNavigate();
  const { checks } = useRunChecks();
  const inPane = useInPane();
  const phone = useLayoutMode() === 'phone' && !inPane;
  const trainedReady = useModelStore((s) => s.retrained.status === 'ready');
  const setActive = useModelStore((s) => s.setActive);
  const first = checksInBucket(checks, 'first')[0];
  const suggested = first && first.next !== null;

  return (
    <div className={cx(styles.footer, className)}>
      {trainedReady && (
        <PillButton
          variant="secondary"
          onClick={() => {
            setActive('retrained');
            navigate(ROUTES.recognize);
          }}
        >
          Use trained model
        </PillButton>
      )}
      <StartTrainingButton
        label={suggested ? `Retrain with ${first.label} ${first.nextText}` : phone ? 'Change settings' : 'Start training'}
        changes={suggested ? { [first.key]: first.next } : undefined}
        applyAndOpen={phone ? ROUTES.train : undefined}
      />
      <p className={styles.note}>Change one setting per run to see its effect.</p>
    </div>
  );
}
