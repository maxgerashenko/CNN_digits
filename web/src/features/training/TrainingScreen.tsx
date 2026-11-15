import { Screen } from '../../components/shell';
import { NavRow } from '../../components/ui';
import { useInPane } from '../../hooks/usePane';
import { ROUTES } from '../../routes';
import { CurveGuide } from './CurveGuide';
import { MetricCard } from './MetricCard';
import { TrainingActions } from './TrainingActions';
import { TrainingStatus } from './TrainingStatus';

export interface TrainingScreenProps {
  className?: string;
}

/** Phone screen 2b, and the "Training" pane on the desktop. */
export function TrainingScreen({ className }: TrainingScreenProps) {
  const inPane = useInPane();
  return (
    <Screen title="Training" variant="pushed" backTo={ROUTES.train} backLabel="Back to settings" gap={16} className={className}>
      <TrainingStatus />
      <MetricCard metric="accuracy" />
      <MetricCard metric="loss" />
      <CurveGuide />
      {!inPane && (
        <NavRow
          to={ROUTES.details}
          title="All metrics"
          subtitle="Train vs validation, per digit, confusion, weights, gradients"
        />
      )}
      <TrainingActions />
    </Screen>
  );
}
