import { useState } from 'react';

import { Screen } from '../../components/shell';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { useInPane } from '../../hooks/usePane';
import { ROUTES } from '../../routes';
import { useSettingsStore } from '../../state/settingsStore';
import { DiagramCaption } from './DiagramCaption';
import { LastRunCard } from './LastRunCard';
import { NetworkDiagram } from './NetworkDiagram';
import { SettingsPanel } from './SettingsPanel';
import { StartTrainingButton } from './StartTrainingButton';

export interface ConfigureScreenProps {
  className?: string;
}

/**
 * Train settings, phone and desktop pane: diagram, last run, settings, start
 * button. On a phone the diagram stays at the top and the title scrolls away.
 */
export function ConfigureScreen({ className }: ConfigureScreenProps) {
  const settings = useSettingsStore((state) => state.settings);
  const inPane = useInPane();
  const phone = useLayoutMode() === 'phone' && !inPane;
  // Phone: once the screen is scrolled, the diagram at the top shows its short version.
  const [scrolled, setScrolled] = useState(false);
  return (
    <Screen
      title="Train"
      variant="root"
      backTo={ROUTES.recognize}
      backLabel="Back to Recognize"
      className={className}
      pinnedReserve
      onScrollTop={(top) => setScrolled((was) => (was ? top >= 36 : top > 48))}
      pinned={<NetworkDiagram settings={settings} sticky={!phone} compact={phone && scrolled} />}
      footer={<StartTrainingButton hint="Get your own model for recognition." />}
    >
      <DiagramCaption />
      <LastRunCard />
      <SettingsPanel />
    </Screen>
  );
}
