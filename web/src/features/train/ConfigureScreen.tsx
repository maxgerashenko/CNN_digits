import { Screen } from '../../components/shell';
import { useSettingsStore } from '../../state/settingsStore';
import { DiagramCaption } from './DiagramCaption';
import { LastRunCard } from './LastRunCard';
import { NetworkDiagram } from './NetworkDiagram';
import { SettingsPanel } from './SettingsPanel';
import { StartTrainingButton } from './StartTrainingButton';

export interface ConfigureScreenProps {
  className?: string;
}

/** Train tab, phone and desktop pane: diagram, last run, settings, start button. */
export function ConfigureScreen({ className }: ConfigureScreenProps) {
  const settings = useSettingsStore((state) => state.settings);
  return (
    <Screen title="Train" variant="root" className={className} footer={<StartTrainingButton />}>
      <NetworkDiagram settings={settings} sticky />
      <DiagramCaption />
      <LastRunCard />
      <SettingsPanel />
    </Screen>
  );
}
