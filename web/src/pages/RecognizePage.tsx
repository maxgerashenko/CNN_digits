import { Pane, Panes, TabletPage } from '../components/shell';
import { useLayoutMode } from '../hooks/useLayoutMode';
import { cx } from '../lib/cx';
import { AnswerCard } from '../features/recognize/AnswerCard';
import { DrawingPad } from '../features/recognize/DrawingPad';
import { HowItWasReadCard } from '../features/recognize/HowItWasReadCard';
import { InsideScreen } from '../features/recognize/InsideScreen';
import { MainScreen } from '../features/recognize/MainScreen';
import { ModelPills } from '../features/recognize/ModelPills';
import { ResultCard } from '../features/recognize/ResultCard';
import columns from './columns.module.css';
import styles from './RecognizePage.module.css';

export function RecognizePage() {
  const mode = useLayoutMode();

  if (mode === 'desktop') {
    return (
      <Panes>
        <Pane label="Draw and result">
          <MainScreen />
        </Pane>
        <Pane label="How it was read">
          <InsideScreen />
        </Pane>
      </Panes>
    );
  }

  if (mode === 'tablet') {
    return (
      <TabletPage title="CNN Digit AI">
        <div className={cx(columns.column, styles.padColumn)}>
          <DrawingPad />
          <ModelPills />
          <ResultCard variant="wide" className={styles.resultCard} />
        </div>
        <div className={cx(columns.column, columns.grow)}>
          <HowItWasReadCard />
        </div>
        <div className={cx(columns.column, columns.grow)}>
          <AnswerCard />
        </div>
      </TabletPage>
    );
  }

  return <MainScreen />;
}
