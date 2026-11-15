import type { ReactNode } from 'react';

import { Screen } from '../../components/shell';
import { useLayoutMode } from '../../hooks/useLayoutMode';
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

export const CHARTS_LEGEND = [
  { label: 'train', line: 'now' },
  { label: 'validation', line: 'accent' },
  { label: 'ideal', line: 'ideal' },
] as const;

export interface ChartCardsProps {
  /** Shown between the numbers and the first chart. */
  legend?: ReactNode;
  /** Shown when there is no finished run. */
  empty: ReactNode;
}

/** The cards of the latest run: numbers, curves, per digit, confusion, weights, gradients. */
export function ChartCards({ legend, empty }: ChartCardsProps) {
  const { run, checks } = useRunChecks();
  const statusOf = (key: string) => checks.find((c) => c.key === key)?.status ?? 'new';
  if (!run) return <>{empty}</>;
  return (
    <>
      <KpiStrip run={run} />
      {legend}
      <CurveCard metric="accuracy" run={run} status={statusOf('train_images')} />
      <CurveCard metric="loss" run={run} status={statusOf('learning_rate')} />
      <PerDigitCard />
      <ConfusionCard />
      <KernelWeightsCard run={run} />
      <HistogramsCard run={run} />
      <GradientCard />
    </>
  );
}

/** Raw charts of the latest run, as its own screen (tablet) and as a desktop pane. */
export function ChartsScreen({ className }: ChartsScreenProps) {
  const phone = useLayoutMode() === 'phone';
  return (
    <Screen
      title="Raw charts"
      variant="pushed"
      backTo={phone ? ROUTES.training : ROUTES.train}
      backLabel={phone ? 'Back to training' : 'Back to settings'}
      className={cx(styles.screen, className)}
    >
      <ChartCards
        legend={<Legend items={CHARTS_LEGEND} />}
        empty={<EmptyState title="No runs yet">Train a network first. The charts show the latest run.</EmptyState>}
      />
    </Screen>
  );
}
