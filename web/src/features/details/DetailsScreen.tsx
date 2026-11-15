import { Screen } from '../../components/shell';
import { EmptyState, Legend, type LegendItem } from '../../components/ui';
import { useRunChecks } from '../../hooks/useRunChecks';
import { ROUTES } from '../../routes';
import { BucketList } from './BucketList';
import { ChangeFirstList } from './ChangeFirstList';
import { ChangedSinceCard } from './ChangedSinceCard';
import { RetrainFooter } from './RetrainFooter';
import { RunSummaryTable } from './RunSummaryTable';

export interface DetailsScreenProps {
  className?: string;
}

/** Analysis: the summary table (it stays at the top on a phone), what changed, the change-first cards and the other settings. */
export function DetailsScreen({ className }: DetailsScreenProps) {
  const { run, prev, checks } = useRunChecks();

  const legend: LegendItem[] = [
    ...(prev ? [{ label: `run ${prev.number}`, line: 'accent' as const }] : []),
    ...(run ? [{ label: `run ${run.number}`, line: 'now' as const }] : []),
    { label: 'ideal', line: 'ideal' },
  ];

  return (
    <Screen
      title="Analysis"
      variant="pushed"
      backTo={ROUTES.train}
      backLabel="Back to settings"
      className={className}
      pinTitle
      pinned={run ? <RunSummaryTable /> : undefined}
    >
      {run ? (
        <>
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
      <RetrainFooter />
    </Screen>
  );
}
