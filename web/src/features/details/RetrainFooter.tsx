import { PillButton } from '../../components/ui';
import { useRunChecks } from '../../hooks/useRunChecks';
import { useStartTraining } from '../../hooks/useStartTraining';
import { checksInBucket } from '../../lib/checks';
import { cx } from '../../lib/cx';
import styles from './RetrainFooter.module.css';

export interface RetrainFooterProps {
  className?: string;
}

/** The main button: retrain with the first suggested change, or plain "Start training". */
export function RetrainFooter({ className }: RetrainFooterProps) {
  const { checks } = useRunChecks();
  const { start, disabled, note } = useStartTraining();
  const first = checksInBucket(checks, 'first')[0];

  const onClick = () => (first && first.next !== null ? start({ [first.key]: first.next }) : start());

  return (
    <div className={cx(styles.footer, className)}>
      <PillButton onClick={onClick} disabled={disabled}>
        {first ? `Retrain with ${first.label} ${first.nextText}` : 'Start training'}
      </PillButton>
      {note && <p className={styles.note}>{note}</p>}
      <p className={styles.note}>
        Change one setting per run. Then the next comparison shows what that setting did on its own.
      </p>
    </div>
  );
}
