import { useState } from 'react';

import { Screen } from '../../components/shell';
import { EmptyState, Legend, type LegendItem } from '../../components/ui';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { useInPane } from '../../hooks/usePane';
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

/** The run table turns short after the screen is scrolled this far, in px, and back above the second value. */
const SHRINK_AFTER = 48;
const GROW_BEFORE = 36;

/** Analysis (its buttons stay at the bottom): the summary table (it stays at the top on a phone), what changed, the change-first cards and the other settings. */
export function DetailsScreen({ className }: DetailsScreenProps) {
  const { run, prev, checks } = useRunChecks();
  const inPane = useInPane();
  const phone = useLayoutMode() === 'phone' && !inPane;
  // Phone: once the screen is scrolled, the run table shows its short version.
  const [scrolled, setScrolled] = useState(false);

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
      pinnedReserve
      footer={<RetrainFooter />}
      onScrollTop={(top) => setScrolled((was) => (was ? top >= GROW_BEFORE : top > SHRINK_AFTER))}
      pinned={
        !run ? undefined : !phone ? (
          <RunSummaryTable />
        ) : (
          <RunSummaryTable variant="panel" short={scrolled} />
        )
      }
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
    </Screen>
  );
}
