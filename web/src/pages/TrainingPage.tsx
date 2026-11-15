import { Pane, Panes, TabletPage } from '../components/shell';
import { useLayoutMode } from '../hooks/useLayoutMode';
import { cx } from '../lib/cx';
import { ChartsScreen } from '../features/charts/ChartsScreen';
import { DetailsScreen } from '../features/details/DetailsScreen';
import { CurveGuide } from '../features/training/CurveGuide';
import { MetricCard } from '../features/training/MetricCard';
import { TrainingActions } from '../features/training/TrainingActions';
import { TrainingScreen } from '../features/training/TrainingScreen';
import { TrainingStatus } from '../features/training/TrainingStatus';
import columns from './columns.module.css';
import styles from './TrainPage.module.css';

// The tablet arrangement has no artboard; it reuses the phone blocks and the
// column widths of the Train page.
export function TrainingPage() {
  const mode = useLayoutMode();

  if (mode === 'desktop') {
    return (
      <Panes>
        <Pane label="Training">
          <TrainingScreen />
        </Pane>
        <Pane label="Analysis">
          <DetailsScreen />
        </Pane>
        <Pane label="Raw charts">
          <ChartsScreen />
        </Pane>
      </Panes>
    );
  }

  if (mode === 'tablet') {
    return (
      <TabletPage title="Training">
        <div className={cx(columns.column, styles.left)}>
          <TrainingStatus />
          <div className={columns.spacer} />
          <TrainingActions />
        </div>
        <div className={cx(columns.column, columns.grow)}>
          <MetricCard metric="accuracy" className={columns.half} />
          <MetricCard metric="loss" className={columns.half} />
        </div>
        <div className={cx(columns.column, styles.right)}>
          <CurveGuide />
        </div>
      </TabletPage>
    );
  }

  return <TrainingScreen />;
}
