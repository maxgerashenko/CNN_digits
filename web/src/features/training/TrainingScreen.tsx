import { useState } from 'react';

import { Screen } from '../../components/shell';
import { EmptyState, Legend } from '../../components/ui';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { useInPane } from '../../hooks/usePane';
import { ROUTES } from '../../routes';
import { ChartCards, CHARTS_LEGEND } from '../charts/ChartsScreen';
import { CurveGuide } from './CurveGuide';
import { MetricCard } from './MetricCard';
import { TrainingActions } from './TrainingActions';
import { TrainingStatus } from './TrainingStatus';
import styles from './TrainingScreen.module.css';

export interface TrainingScreenProps {
  className?: string;
}

/**
 * Phone screen 2b, and the "Training" pane on the desktop.
 *
 * On a phone the title row, the progress and the Accuracy card stay at the
 * top. Loss, the curve guide and the raw charts scroll under them, and the
 * buttons stay at the bottom.
 */
export function TrainingScreen({ className }: TrainingScreenProps) {
  const inPane = useInPane();
  const phone = useLayoutMode() === 'phone' && !inPane;
  // Phone: once the screen is scrolled, the Accuracy card at the top shows its short version.
  const [scrolled, setScrolled] = useState(false);

  if (!phone) {
    return (
      <Screen title="Training" variant="pushed" backTo={ROUTES.train} backLabel="Back to settings" gap={16} className={className}>
        <TrainingStatus />
        <MetricCard metric="accuracy" />
        <MetricCard metric="loss" />
        <CurveGuide />
        <TrainingActions />
      </Screen>
    );
  }

  return (
    <Screen
      title="Training"
      variant="pushed"
      backTo={ROUTES.train}
      backLabel="Back to settings"
      gap={16}
      className={className}
      pinTitle
      pinnedReserve
      onScrollTop={(top) => setScrolled((was) => (was ? top >= 36 : top > 48))}
      pinned={
        <>
          <TrainingStatus hideLegend={scrolled} />
          <MetricCard metric="accuracy" small={scrolled} />
        </>
      }
      footer={<TrainingActions />}
    >
      <MetricCard metric="loss" />
      <CurveGuide />
      <section className={styles.charts} aria-label="Raw charts">
        <h2 className={styles.heading}>Raw charts</h2>
        <ChartCards
          legend={<Legend items={CHARTS_LEGEND} />}
          empty={<EmptyState title="No finished run yet">The charts of the run show here when it is done.</EmptyState>}
        />
      </section>
    </Screen>
  );
}
