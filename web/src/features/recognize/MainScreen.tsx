import { NavRow } from '../../components/ui';
import { Screen } from '../../components/shell';
import { useInPane } from '../../hooks/usePane';
import { ROUTES } from '../../routes';
import { DrawingPad } from './DrawingPad';
import { ModelPills } from './ModelPills';
import { ResultCard } from './ResultCard';

export interface MainScreenProps {
  className?: string;
}

/** Recognize: pick a model, draw a digit, read the answer. */
export function MainScreen({ className }: MainScreenProps) {
  const inPane = useInPane();
  return (
    <Screen title="Recognize" variant="root" className={className}>
      <ModelPills />
      <DrawingPad />
      <ResultCard variant="bars" />
      {!inPane && <NavRow to={ROUTES.inside} title="How it was read" />}
    </Screen>
  );
}
