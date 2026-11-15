import { Legend, Mono, ProgressBar } from '../../components/ui';
import { useElapsedSeconds } from '../../hooks/useElapsedSeconds';
import { cx } from '../../lib/cx';
import { estimate } from '../../lib/estimate';
import { useTrainingStore } from '../../state/trainingStore';
import styles from './TrainingStatus.module.css';

export interface TrainingStatusProps {
  className?: string;
}

const LEGEND = [
  { label: 'your network', line: 'now' },
  { label: 'ideal shape', line: 'ideal' },
  { label: 'goal', line: 'goal' },
] as const;

/** Where the run is: phase text, elapsed time, progress by finished epochs, and the legend. */
export function TrainingStatus({ className }: TrainingStatusProps) {
  const phase = useTrainingStore((s) => s.phase);
  const position = useTrainingStore((s) => s.position);
  const epochs = useTrainingStore((s) => s.epochs);
  const jobSettings = useTrainingStore((s) => s.jobSettings);
  const startedAt = useTrainingStore((s) => s.startedAt);
  const error = useTrainingStore((s) => s.error);
  const elapsed = useElapsedSeconds(startedAt, phase === 'running');

  const total = jobSettings?.epochs ?? epochs[epochs.length - 1]?.epochs ?? 0;
  const finished = epochs.length;

  let left = '';
  let right = '';
  let value = 0;
  switch (phase) {
    case 'idle':
      left = 'No training in progress';
      break;
    case 'waking':
      left = 'Server is starting, about 1 minute';
      break;
    case 'queued':
      left = position > 0 ? `In line, place ${position}` : 'Starting the run';
      break;
    case 'running':
      left = `Epoch ${Math.min(finished + 1, Math.max(total, 1))} / ${total}`;
      right = `${elapsed} s${jobSettings ? ` · ${estimate(jobSettings).text}` : ''}`;
      value = total > 0 ? finished / total : 0;
      break;
    case 'finishing':
      left = 'Loading the new model';
      value = 1;
      break;
    case 'done':
      left = 'Training done';
      right = finished > 0 ? `${Math.round(epochs[finished - 1].seconds)} s` : '';
      value = 1;
      break;
    case 'stopped':
      left = 'Training stopped';
      value = total > 0 ? finished / total : 0;
      break;
    case 'error':
      left = error ?? 'Training failed.';
      value = total > 0 ? finished / total : 0;
      break;
  }

  return (
    <div className={cx(styles.root, className)}>
      <section className={styles.block}>
        <div className={styles.line}>
          <span className={cx(styles.left, phase === 'error' && styles.error)} role={phase === 'error' ? 'alert' : 'status'}>
            {left}
          </span>
          {right && <Mono className={styles.right}>{right}</Mono>}
        </div>
        <ProgressBar label="Training progress" value={value} />
      </section>
      <Legend items={LEGEND} />
    </div>
  );
}
