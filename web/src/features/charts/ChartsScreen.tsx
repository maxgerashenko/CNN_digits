import { Screen } from '../../components/shell';
import { EmptyState, Legend } from '../../components/ui';
import { useRunChecks } from '../../hooks/useRunChecks';
import { ROUTES } from '../../routes';
import { ConfusionCard } from './ConfusionCard';
import { CurveCard } from './CurveCard';
import { GradientCard } from './GradientCard';
import { HistogramsCard } from './HistogramsCard';
import { KernelWeightsCard } from './KernelWeightsCard';
import { KpiStrip } from './KpiStrip';
import { PerDigitCard } from './PerDigitCard';
import styles from './ChartsScreen.module.css';
import { cx } from '../../lib/cx';

export interface ChartsScreenProps {
  className?: string;
}

const LEGEND = [
  { label: 'train', line: 'now' },
  { label: 'validation', line: 'accent' },
  { label: 'ideal', line: 'ideal' },
] as const;

/** Raw charts of the latest run. */
export function ChartsScreen({ className }: ChartsScreenProps) {
  const { run, checks } = useRunChecks();
  const statusOf = (key: string) => checks.find((c) => c.key === key)?.status ?? 'new';

  return (
    <Screen
      title="Raw charts"
      variant="pushed"
      backTo={ROUTES.details}
      backLabel="Back to run details"
      className={cx(styles.screen, className)}
    >
      {run ? (
        <>
          <KpiStrip run={run} />
          <Legend items={LEGEND} />
          <CurveCard metric="accuracy" run={run} status={statusOf('train_images')} />
          <CurveCard metric="loss" run={run} status={statusOf('learning_rate')} />
          <PerDigitCard />
          <ConfusionCard />
          <KernelWeightsCard />
          <HistogramsCard />
          <GradientCard />
        </>
      ) : (
        <EmptyState title="No runs yet">Train a network first. The charts show the latest run.</EmptyState>
      )}
    </Screen>
  );
}
