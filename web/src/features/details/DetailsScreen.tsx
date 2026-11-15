import { Screen } from '../../components/shell';
import { EmptyState, Legend, NavRow, type LegendItem } from '../../components/ui';
import { useRunChecks } from '../../hooks/useRunChecks';
import { useInPane } from '../../hooks/usePane';
import { ROUTES } from '../../routes';
import { BucketList } from './BucketList';
import { ChangeFirstList } from './ChangeFirstList';
import { ChangedSinceCard } from './ChangedSinceCard';
import { RetrainFooter } from './RetrainFooter';
import { RunSummaryTable } from './RunSummaryTable';

export interface DetailsScreenProps {
  className?: string;
}

/** Run details: the summary table, what changed, the change-first cards and the other settings. */
export function DetailsScreen({ className }: DetailsScreenProps) {
  const { run, prev, checks } = useRunChecks();
  const inPane = useInPane();

  const legend: LegendItem[] = [
    ...(prev ? [{ label: `run ${prev.number}`, line: 'accent' as const }] : []),
    ...(run ? [{ label: `run ${run.number}`, line: 'now' as const }] : []),
    { label: 'ideal', line: 'ideal' },
  ];

  return (
    <Screen
      title="Run details"
      variant="pushed"
      backTo={ROUTES.train}
      backLabel="Back to settings"
      className={className}
    >
      {run ? (
        <>
          <RunSummaryTable />
          <ChangedSinceCard />
          <Legend items={legend} />
          <ChangeFirstList />
          <BucketList bucket="later" checks={checks} />
          <BucketList bucket="keep" checks={checks} />
          <BucketList bucket="unmeasured" checks={checks} />
        </>
      ) : (
        <EmptyState title="No runs yet">
          Train a network once. Then this screen compares the run with the ideal and says what to change first.
        </EmptyState>
      )}
      {!inPane && (
        <NavRow
          to={ROUTES.charts}
          title="Raw charts"
          subtitle="Curves, per digit, confusion matrix, histograms, gradients"
        />
      )}
      <RetrainFooter />
    </Screen>
  );
}
