import { useRunChecks } from '../../hooks/useRunChecks';
import { checksInBucket } from '../../lib/checks';
import { cx } from '../../lib/cx';
import { StartTrainingButton } from '../train/StartTrainingButton';
import styles from './RetrainFooter.module.css';

export interface RetrainFooterProps {
  className?: string;
}

/** The main button: retrain with the first suggested change, or plain "Start training". */
export function RetrainFooter({ className }: RetrainFooterProps) {
  const { checks } = useRunChecks();
  const first = checksInBucket(checks, 'first')[0];
  const suggested = first && first.next !== null;

  return (
    <div className={cx(styles.footer, className)}>
      <StartTrainingButton
        label={suggested ? `Retrain with ${first.label} ${first.nextText}` : 'Start training'}
        changes={suggested ? { [first.key]: first.next } : undefined}
      />
      <p className={styles.note}>
        Change one setting per run. Then the next comparison shows what that setting did on its own.
      </p>
    </div>
  );
}
