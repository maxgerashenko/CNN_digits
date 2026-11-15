import { Pane, Panes, TabletPage } from '../components/shell';
import { useLayoutMode } from '../hooks/useLayoutMode';
import { cx } from '../lib/cx';
import { ChartsScreen } from '../features/charts/ChartsScreen';
import { ChangeFirstColumn } from '../features/details/ChangeFirstColumn';
import { DetailsScreen } from '../features/details/DetailsScreen';
import { RunSummaryTable } from '../features/details/RunSummaryTable';
import { ConfigureScreen } from '../features/train/ConfigureScreen';
import { DiagramCaption } from '../features/train/DiagramCaption';
import { NetworkDiagram } from '../features/train/NetworkDiagram';
import { SettingsGrid } from '../features/train/SettingsGrid';
import { StartTrainingButton } from '../features/train/StartTrainingButton';
import { useSettingsStore } from '../state/settingsStore';
import { selectLatestRun, useTrainingStore } from '../state/trainingStore';
import columns from './columns.module.css';
import styles from './TrainPage.module.css';

export function TrainPage() {
  const mode = useLayoutMode();
  const settings = useSettingsStore((state) => state.settings);
  const hasRun = useTrainingStore((state) => selectLatestRun(state) !== null);

  if (mode === 'desktop') {
    return (
      <Panes>
        <Pane label="Settings">
          <ConfigureScreen />
        </Pane>
        <Pane label="Run details">
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
      <TabletPage title="Train">
        <div className={cx(columns.column, styles.left)}>
          <NetworkDiagram settings={settings} />
          <DiagramCaption />
          {hasRun && <RunSummaryTable compact />}
          <div className={columns.spacer} />
          <StartTrainingButton />
        </div>
        <div className={cx(columns.column, columns.grow)}>
          <SettingsGrid />
        </div>
        <div className={cx(columns.column, styles.right)}>
          <ChangeFirstColumn />
        </div>
      </TabletPage>
    );
  }

  return <ConfigureScreen />;
}
