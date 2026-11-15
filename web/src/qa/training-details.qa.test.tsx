// QA tests for the Training-in-progress screen (P6) and the Run details
// screen (P7, P8). Written by the tester; they check acceptance points that
// the package tests do not cover.

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { ChangeFirstColumn } from '../features/details/ChangeFirstColumn';
import { ChangeFirstList } from '../features/details/ChangeFirstList';
import { DetailsScreen } from '../features/details/DetailsScreen';
import { explainCheck } from '../features/details/explain';
import { GapBar } from '../features/details/GapBar';
import { CurveGuide } from '../features/training/CurveGuide';
import { MetricCard } from '../features/training/MetricCard';
import { TrainingActions } from '../features/training/TrainingActions';
import { TrainingScreen } from '../features/training/TrainingScreen';
import { TrainingStatus } from '../features/training/TrainingStatus';
import { evaluateChecks, type CheckResult } from '../lib/checks';
import { estimate } from '../lib/estimate';
import { LayoutModeProvider } from '../hooks/useLayoutMode';
import { PaneProvider } from '../hooks/usePane';
import { useModelStore } from '../state/modelStore';
import { useSettingsStore } from '../state/settingsStore';
import {
  NOT_CONFIGURED_TEXT,
  configureTraining,
  useTrainingStore,
  type TrainingPhase,
  type TrainingState,
} from '../state/trainingStore';
import { makeAnalysis, makeEpochs, runOne, runTwo, settingsWith } from '../test/fixtures';
import { renderApp, resetStores } from '../test/utils';
import type { RunRecord } from '../types';

const settings2 = settingsWith({ epochs: 2 });

function setTraining(patch: Partial<TrainingState>) {
  act(() => useTrainingStore.setState(patch));
}

function setRuns(runs: RunRecord[]) {
  act(() => useTrainingStore.setState({ runs }));
}

/** Shows the current address so a test can check where a button sent the visitor. */
function Where() {
  const { pathname } = useLocation();
  return <output data-testid="where">{pathname}</output>;
}

function where(): string {
  return screen.getByTestId('where').textContent ?? '';
}

/** Renders one component at an address; every address shows the same component. */
function at(ui: ReactNode, { mode = 'phone' as 'phone' | 'tablet' | 'desktop', route = '/train/run' } = {}) {
  return render(
    <LayoutModeProvider mode={mode}>
      <MemoryRouter initialEntries={[route]}>
        <Where />
        <Routes>
          <Route path="*" element={ui} />
        </Routes>
      </MemoryRouter>
    </LayoutModeProvider>,
  );
}

/** A server that is ready but never answers a run, so a started run stays in 'waking'. */
const READY_SERVER = {
  status: 'ready',
  statusText: 'Ready',
  wake: () => Promise.resolve(),
  whenReady: () => new Promise<void>(() => {}),
  markAsleep: () => {},
  url: (path: string) => path,
};

function configureReady() {
  configureTraining({ server: READY_SERVER as never, api: {} as never });
}

function rowFor(name: string): HTMLElement {
  const table = screen.getByRole('table', { name: 'Run summary' });
  return within(table).getByRole('rowheader', { name }).closest('tr') as HTMLElement;
}

/** A run that passes every check, so nothing is "Change first". */
const goodRun: RunRecord = {
  id: 'job-good',
  number: 2,
  settings: settingsWith({ epochs: 3 }),
  epochs: makeEpochs([
    { accuracy: 0.985, loss: 0.05, valAccuracy: 0.988, valLoss: 0.04, seconds: 20 },
    { accuracy: 0.989, loss: 0.035, valAccuracy: 0.989, valLoss: 0.0399, seconds: 40 },
    { accuracy: 0.9895, loss: 0.033, valAccuracy: 0.99, valLoss: 0.0398, seconds: 60 },
  ]),
  results: {
    testAccuracy: 0.99,
    mistakes: 90,
    testImages: 10000,
    loss: 0.033,
    accuracy: 0.9895,
    valLoss: 0.0398,
    valAccuracy: 0.99,
    epochs: 3,
    trainingSeconds: 60,
  },
  analysis: makeAnalysis({ denseBell: true, deadFilterShare: 0 }),
  params: runOne.params,
};

beforeEach(() => {
  resetStores();
  configureTraining({ server: null, api: null });
});

// ---------------------------------------------------------------------------
// P6: TrainingStatus
// ---------------------------------------------------------------------------

describe('QA: TrainingStatus phases', () => {
  it('queued shows the place in line and no progress', () => {
    setTraining({ phase: 'queued', position: 1, jobSettings: settings2 });
    at(<TrainingStatus />);
    expect(screen.getByText('In line, place 1')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('error with no message says "Training failed." and keeps progress by finished epochs', () => {
    const five = settingsWith({ epochs: 5 });
    setTraining({
      phase: 'error',
      error: null,
      jobSettings: five,
      epochs: makeEpochs([0, 1].map((i) => ({ accuracy: 0.9, loss: 0.3, valAccuracy: 0.95, valLoss: 0.2, seconds: 10 * (i + 1) }))),
    });
    at(<TrainingStatus />);
    expect(screen.getByRole('alert')).toHaveTextContent('Training failed.');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  });

  it('five epochs: after two finished it shows Epoch 3 / 5, progress 40 and the estimate for the run', () => {
    const five = settingsWith({ epochs: 5 });
    setTraining({
      phase: 'running',
      jobSettings: five,
      startedAt: Date.now() - 12_000,
      epochs: makeEpochs([0, 1].map((i) => ({ accuracy: 0.9, loss: 0.3, valAccuracy: 0.95, valLoss: 0.2, seconds: 10 * (i + 1) }))),
    });
    at(<TrainingStatus />);
    expect(screen.getByText('Epoch 3 / 5')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText(new RegExp(`· ${estimate(five).text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))).toBeInTheDocument();
  });

  it('running with no start time shows 0 s, not NaN', () => {
    setTraining({ phase: 'running', jobSettings: settings2, startedAt: null, epochs: [] });
    at(<TrainingStatus />);
    expect(screen.getByText(/^0 s ·/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('NaN');
  });

  it('done shows the total training seconds of the last epoch and progress 100', () => {
    setTraining({
      phase: 'done',
      jobSettings: settings2,
      epochs: makeEpochs([
        { accuracy: 0.9, loss: 0.3, valAccuracy: 0.96, valLoss: 0.14, seconds: 29 },
        { accuracy: 0.965, loss: 0.11, valAccuracy: 0.979, valLoss: 0.07, seconds: 58.4 },
      ]),
    });
    at(<TrainingStatus />);
    expect(screen.getByText('Training done')).toBeInTheDocument();
    expect(screen.getByText('58 s')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('stopped keeps the progress of the epochs that finished', () => {
    setTraining({
      phase: 'stopped',
      jobSettings: settings2,
      epochs: makeEpochs([{ accuracy: 0.9, loss: 0.3, valAccuracy: 0.96, valLoss: 0.14, seconds: 29 }]),
    });
    at(<TrainingStatus />);
    expect(screen.getByText('Training stopped')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });

  it('idle says no training is in progress; waking has no progress; finishing is full', () => {
    const { unmount } = at(<TrainingStatus />);
    expect(screen.getByText('No training in progress')).toBeInTheDocument();
    unmount();
    setTraining({ phase: 'waking', jobSettings: settings2 });
    const second = at(<TrainingStatus />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    second.unmount();
    setTraining({ phase: 'finishing', jobSettings: settings2 });
    at(<TrainingStatus />);
    expect(screen.getByText('Loading the new model')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
});

// ---------------------------------------------------------------------------
// P6: MetricCard
// ---------------------------------------------------------------------------

const row = (valAccuracy: number, valLoss: number, seconds: number) => ({
  accuracy: valAccuracy - 0.02,
  loss: valLoss + 0.05,
  valAccuracy,
  valLoss,
  seconds,
});

describe('QA: MetricCard goal and verdict', () => {
  it('accuracy at or above the goal says "goal reached" and no distance', () => {
    setTraining({ phase: 'running', jobSettings: settings2, epochs: makeEpochs([row(0.996, 0.02, 29)]) });
    at(<MetricCard metric="accuracy" />);
    expect(screen.getByText('goal reached')).toBeInTheDocument();
    expect(screen.queryByText(/to go/)).toBeNull();
  });

  it('accuracy distance to the goal is computed from the latest epoch', () => {
    setTraining({ phase: 'running', jobSettings: settings2, epochs: makeEpochs([row(0.96, 0.14, 29), row(0.979, 0.07, 58)]) });
    at(<MetricCard metric="accuracy" />);
    expect(screen.getByText('97.9%')).toBeInTheDocument();
    expect(screen.getByText('1.63 to go')).toBeInTheDocument();
  });

  it('loss with 0 epochs: dash value, goal near 0, lower is better, no verdict', () => {
    setTraining({ phase: 'running', jobSettings: settings2, epochs: [] });
    at(<MetricCard metric="loss" />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('goal near 0')).toBeInTheDocument();
    expect(screen.getByText('lower is better')).toBeInTheDocument();
    expect(screen.queryByText('on track')).toBeNull();
    expect(screen.queryByText('off track')).toBeNull();
  });

  it('both cards say "off track" when accuracy falls and loss rises', () => {
    setTraining({ phase: 'running', jobSettings: settings2, epochs: makeEpochs([row(0.979, 0.07, 29), row(0.975, 0.09, 58)]) });
    at(
      <>
        <MetricCard metric="accuracy" />
        <MetricCard metric="loss" />
      </>,
    );
    expect(screen.getAllByText('off track')).toHaveLength(2);
    expect(screen.queryByText('on track')).toBeNull();
  });

  it('chart labels: no epoch yet, then epochs so far with the latest value', () => {
    setTraining({ phase: 'running', jobSettings: settings2, epochs: [] });
    const first = at(<MetricCard metric="accuracy" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('Accuracy: no epoch has finished yet');
    first.unmount();
    setTraining({ epochs: makeEpochs([row(0.96, 0.14, 29)]) });
    at(<MetricCard metric="loss" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('Loss per epoch: 1 of 2 epochs so far, latest 0.14');
  });

  it('each card shows its own hint sentence', () => {
    at(
      <>
        <MetricCard metric="accuracy" />
        <MetricCard metric="loss" />
      </>,
    );
    expect(screen.getByText('Should climb fast, then flatten just under the goal line.')).toBeInTheDocument();
    expect(screen.getByText('Should drop fast, then flatten close to 0. Still falling is good.')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// P6: CurveGuide
// ---------------------------------------------------------------------------

describe('QA: CurveGuide', () => {
  it('shows all four cases with their fix sentence, and the drawings are hidden from readers', () => {
    const { container } = at(<CurveGuide />);
    expect(screen.getByText('Barely moves')).toBeInTheDocument();
    expect(screen.getByText('Learning rate too low. Raise it or add epochs.')).toBeInTheDocument();
    expect(screen.getByText('Flattens far below the goal')).toBeInTheDocument();
    expect(screen.getByText('Network too small. Add a block or more filters.')).toBeInTheDocument();
    expect(screen.getByText('Good in training, worse on the test')).toBeInTheDocument();
    expect(screen.getByText('Learning rate too high. Lower it.')).toBeInTheDocument();
    const drawings = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(drawings).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// P6: TrainingActions
// ---------------------------------------------------------------------------

describe('QA: TrainingActions', () => {
  it.each(['idle', 'waking', 'queued', 'running', 'finishing', 'error', 'stopped'] as TrainingPhase[])(
    '"Use my retrained model" is disabled in phase %s',
    (phase) => {
      setTraining({ phase, jobSettings: settings2, error: phase === 'error' ? 'x' : null });
      at(<TrainingActions />);
      expect(screen.getByRole('button', { name: 'Use my retrained model' })).toBeDisabled();
    },
  );

  it('while queued, "Stop training" stops, keeps the finished runs and goes to settings', async () => {
    setRuns([runOne]);
    setTraining({ phase: 'queued', position: 2, jobSettings: settings2 });
    at(<TrainingActions />);
    expect(screen.queryByRole('link', { name: 'Back to settings' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Stop training' }));
    expect(useTrainingStore.getState().phase).toBe('stopped');
    expect(useTrainingStore.getState().runs).toHaveLength(1);
    expect(where()).toBe('/train');
  });

  it('Stop while running discards the run in progress and shows no retrain button', async () => {
    setTraining({ phase: 'running', jobSettings: settings2, epochs: makeEpochs([row(0.96, 0.14, 29)]) });
    at(<TrainingActions />);
    await userEvent.click(screen.getByRole('button', { name: 'Stop training' }));
    expect(useTrainingStore.getState().phase).toBe('stopped');
    expect(useTrainingStore.getState().runs).toHaveLength(0);
    expect(useModelStore.getState().active).toBe('saved');
  });

  it('after an error, "Back to settings" resets to idle and keeps the finished runs', async () => {
    setRuns([runOne]);
    setTraining({ phase: 'error', error: 'Too many images for the time limit.', jobSettings: settings2 });
    at(<TrainingActions />);
    await userEvent.click(screen.getByRole('link', { name: 'Back to settings' }));
    expect(useTrainingStore.getState().phase).toBe('idle');
    expect(useTrainingStore.getState().runs).toHaveLength(1);
    expect(where()).toBe('/train');
  });

  it('Stop is not offered once a run is done', () => {
    setTraining({ phase: 'done', jobSettings: settings2 });
    at(<TrainingActions />);
    expect(screen.queryByRole('button', { name: 'Stop training' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to settings' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// P6: TrainingScreen as a whole
// ---------------------------------------------------------------------------

describe('QA: TrainingScreen', () => {
  it('works with 0 epochs at full screen', () => {
    setTraining({ phase: 'running', jobSettings: settings2, startedAt: Date.now(), epochs: [] });
    renderApp({ route: '/train/run', mode: 'phone' });
    expect(screen.getByRole('heading', { level: 1, name: 'Training' })).toBeInTheDocument();
    expect(screen.getByText('Epoch 1 / 2')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('works with 5 epochs at full screen and reports all five', () => {
    const five = [0.9, 0.94, 0.96, 0.97, 0.98].map((a, i) => row(a, 0.3 - i * 0.05, 10 * (i + 1)));
    setTraining({ phase: 'running', jobSettings: settingsWith({ epochs: 5 }), startedAt: Date.now(), epochs: makeEpochs(five) });
    renderApp({ route: '/train/run', mode: 'phone' });
    expect(screen.getByText('Epoch 5 / 5')).toBeInTheDocument();
    const charts = screen.getAllByRole('img');
    expect(charts.some((c) => /5 of 5 epochs so far, latest 98.0%/.test(c.getAttribute('aria-label') ?? ''))).toBe(true);
    expect(screen.getByRole('link', { name: /All metrics/ })).toBeInTheDocument();
  });

  it('a finished 5-epoch run keeps the screen whole in a pane (no All metrics link)', () => {
    const five = [0.9, 0.94, 0.96, 0.97, 0.98].map((a, i) => row(a, 0.3 - i * 0.05, 10 * (i + 1)));
    setTraining({ phase: 'done', jobSettings: settingsWith({ epochs: 5 }), epochs: makeEpochs(five) });
    render(
      <LayoutModeProvider mode="desktop">
        <MemoryRouter>
          <PaneProvider>
            <TrainingScreen />
          </PaneProvider>
        </MemoryRouter>
      </LayoutModeProvider>,
    );
    expect(screen.getByText('Training done')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /All metrics/ })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P7: RunSummaryTable values
// ---------------------------------------------------------------------------

describe('QA: summary table values', () => {
  it('two runs: run 1, run 2 and ideal values for each measure', () => {
    setRuns([runOne, runTwo]);
    renderApp({ route: '/train/details' });
    const cells = (name: string) => within(rowFor(name)).getAllByRole('cell').map((c) => c.textContent);
    expect(cells('Val accuracy')).toEqual(['97.9%', '98.6%', '99.53%']);
    expect(cells('Mistakes')).toEqual(['210', '138', '47']);
    expect(cells('Val loss')).toEqual(['0.07', '0.05', 'near 0']);
  });

  it('header names the two runs and the ideal column', () => {
    setRuns([runOne, runTwo]);
    renderApp({ route: '/train/details' });
    const table = screen.getByRole('table', { name: 'Run summary' });
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['Measure', 'run 1', 'run 2', 'ideal']);
  });
});

// ---------------------------------------------------------------------------
// P7: "Changed since"
// ---------------------------------------------------------------------------

describe('QA: changed since card', () => {
  it('lists each changed setting as old → new', () => {
    setRuns([runOne, { ...runTwo, settings: settingsWith({ epochs: 4, dropout: 0.3 }) }]);
    renderApp({ route: '/train/details' });
    expect(screen.getByText('Changed since run 1')).toBeInTheDocument();
    const changedCard = screen.getByText('Changed since run 1').parentElement as HTMLElement;
    expect((changedCard.textContent ?? '').split('→').length - 1).toBe(2);
    expect(screen.getByText('Dropout')).toBeInTheDocument();
    expect(screen.getByText('Epochs')).toBeInTheDocument();
  });

  it('one change gets the exact "whole difference" sentence', () => {
    setRuns([runOne, runTwo]);
    renderApp({ route: '/train/details' });
    expect(screen.getByText('Only one setting changed, so the whole difference between the runs belongs to it.')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// P7: "Not measured" list
// ---------------------------------------------------------------------------

describe('QA: not measured list', () => {
  it('lists Batch norm and Batch size with the reason the server does not send them', () => {
    setRuns([runOne, runTwo]);
    renderApp({ route: '/train/details' });
    const heading = screen.getByText('Not measured');
    const section = heading.closest('section') as HTMLElement;
    expect(within(section).getByText(/Batch norm/)).toBeInTheDocument();
    expect(within(section).getByText(/Batch size/)).toBeInTheDocument();
    expect(within(section).getByText('The training server does not send gradient sizes.')).toBeInTheDocument();
    expect(within(section).getByText('The training server reports the loss once per epoch, not per step.')).toBeInTheDocument();
  });

  it('a one-epoch run gives the "2 or more epochs" reason for Epochs and Learning rate', () => {
    const oneEpoch: RunRecord = {
      ...runOne,
      epochs: makeEpochs([{ accuracy: 0.9, loss: 0.3, valAccuracy: 0.96, valLoss: 0.14, seconds: 29 }]),
      results: { ...runOne.results, epochs: 1, trainingSeconds: 29 },
    };
    setRuns([oneEpoch]);
    renderApp({ route: '/train/details' });
    expect(screen.getAllByText('Needs a run with 2 or more epochs.')).toHaveLength(2);
  });

  it('a run without weights gives the weights reason and no dead-filter number', () => {
    setRuns([{ ...runOne, analysis: null }]);
    renderApp({ route: '/train/details' });
    expect(screen.getAllByText('The trained weights could not be read.').length).toBeGreaterThanOrEqual(1);
    const section = screen.getByText('Not measured').closest('section') as HTMLElement;
    expect(within(section).queryByText(/%/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P7: Retrain footer
// ---------------------------------------------------------------------------

describe('QA: retrain footer', () => {
  it('with no runs and a server, the button reads "Start training" and starts with the form settings', async () => {
    configureReady();
    renderApp({ route: '/train/details' });
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Start training' });
    await userEvent.click(button);
    expect(useSettingsStore.getState().settings).toEqual(settingsWith());
    expect(useTrainingStore.getState().phase).toBe('waking');
    expect(screen.getByText('Server is starting, about 1 minute')).toBeInTheDocument();
  });

  it('"Retrain with Epochs 4" puts Epochs 4 into the form and starts a run', async () => {
    configureReady();
    setRuns([runOne]);
    renderApp({ route: '/train/details' });
    await userEvent.click(screen.getByRole('button', { name: 'Retrain with Epochs 4' }));
    expect(useSettingsStore.getState().settings.epochs).toBe(4);
    expect(useTrainingStore.getState().jobSettings?.epochs).toBe(4);
    expect(useTrainingStore.getState().phase).toBe('waking');
  });

  it('while a run is in progress it reads "Training, view progress" and links to the run', () => {
    configureReady();
    setRuns([runOne]);
    setTraining({ phase: 'running', jobSettings: settings2, epochs: [] });
    renderApp({ route: '/train/details' });
    expect(screen.queryByRole('button', { name: 'Retrain with Epochs 4' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Training, view progress' })).toHaveAttribute('href', '/train/run');
  });

  it('without a server address it is disabled and says training is not set up', () => {
    setRuns([runOne]);
    renderApp({ route: '/train/details' });
    expect(screen.getByRole('button', { name: 'Retrain with Epochs 4' })).toBeDisabled();
    expect(screen.getByText(NOT_CONFIGURED_TEXT)).toBeInTheDocument();
  });

  it('a run that passes every check gives "Start training" and the Nothing to change first state', () => {
    configureReady();
    setRuns([runOne, goodRun]);
    renderApp({ route: '/train/details' });
    expect(screen.getByRole('button', { name: 'Start training' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Change first' })).toBeInTheDocument();
    expect(screen.getByText('Nothing to change first')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Set / })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P8: change-first cards
// ---------------------------------------------------------------------------

describe('QA: change-first cards', () => {
  it('"Set" on the phone applies the value and goes to Settings', async () => {
    setRuns([runOne]);
    at(<ChangeFirstList />, { mode: 'phone', route: '/train/details' });
    const card = screen.getByRole('heading', { name: 'Epochs' }).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Set 4' }));
    expect(useSettingsStore.getState().settings.epochs).toBe(4);
    expect(where()).toBe('/train');
  });

  it('"Set" on the desktop applies the value and stays on the page', async () => {
    setRuns([runOne]);
    at(<ChangeFirstList />, { mode: 'desktop', route: '/train/details' });
    const card = screen.getByRole('heading', { name: 'Epochs' }).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Set 4' }));
    expect(useSettingsStore.getState().settings.epochs).toBe(4);
    expect(where()).toBe('/train/details');
  });

  it('a run worse than the one before shows 0% of the gap closed and an empty fill', () => {
    const worse: RunRecord = { ...runTwo, results: { ...runTwo.results, valLoss: 0.09 } };
    setRuns([runOne, worse]);
    at(<ChangeFirstList />, { mode: 'phone', route: '/train/details' });
    const card = screen.getByRole('heading', { name: 'Epochs' }).closest('section') as HTMLElement;
    expect(within(card).getByText(/0% of the gap closed/)).toBeInTheDocument();
    const bar = within(card).getByRole('img', { name: /0 percent of the gap/ });
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('0%');
    expect(within(card).getByText(/0% of the way to 0.05/)).toBeInTheDocument();
  });

  it('the explanation keeps the numbers of a measured change (only Epochs changed)', () => {
    const worse: RunRecord = { ...runTwo, results: { ...runTwo.results, valLoss: 0.09 } };
    const checks = evaluateChecks({ run: worse, prev: runOne, settings: settingsWith() });
    const epochs = checks.find((c) => c.key === 'epochs') as CheckResult;
    expect(epochs.bucket).toBe('first');
    const text = explainCheck(epochs);
    expect(text).toContain('Epochs was the only change');
    expect(text).toContain('went from 0.07 to 0.09');
    expect(text).toContain('Try Epochs 5 next.');
  });

  it('a card with no previous run gives no gap percentage and says it is the first run', () => {
    setRuns([runOne]);
    at(<ChangeFirstList />, { mode: 'phone', route: '/train/details' });
    expect(screen.queryByText(/of the gap closed/)).toBeNull();
    expect(screen.queryByText(/of the way to/)).toBeNull();
    expect(screen.getAllByText(/This is the first run, so there is nothing to compare yet/).length).toBeGreaterThan(0);
  });

  it('explanation when the previous run has no value: must not call it the first run', () => {
    // Previous run exists but reports no val loss. The text should say the
    // earlier run has no number, not that this is the first run.
    const now: RunRecord = { ...runTwo, results: { ...runTwo.results, valLoss: 0.09 } };
    const prev: RunRecord = { ...runOne, results: { ...runOne.results, valLoss: Number.NaN } };
    const checks = evaluateChecks({ run: now, prev, settings: settingsWith() });
    const epochs = checks.find((c) => c.key === 'epochs') as CheckResult;
    expect(epochs.numbers?.prevText).toBeNull();
    expect(explainCheck(epochs)).not.toContain('first run');
  });

  it('the column for tablet shows compact cards without a Set button and a "Nothing to change first" state for a good run', () => {
    setRuns([goodRun]);
    at(<ChangeFirstColumn />, { mode: 'tablet', route: '/train' });
    expect(screen.getByText('Nothing to change first')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Set/ })).toBeNull();
    expect(screen.getByText('0 settings')).toBeInTheDocument();
    expect(screen.getByText('11 settings')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// P8: GapBar edge values
// ---------------------------------------------------------------------------

describe('QA: GapBar', () => {
  it('0% closed: empty fill and the label says 0%', () => {
    render(<GapBar prevText="0.07" nowText="0.09" idealText="0.05" closed={0} />);
    const bar = screen.getByRole('img');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('0%');
    expect(screen.getByText(/0% of the gap closed/)).toBeInTheDocument();
  });

  it('100% closed: full fill and the label says 100%', () => {
    render(<GapBar prevText="0.07" nowText="0.05" idealText="0.05" closed={100} />);
    const bar = screen.getByRole('img');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%');
    expect(screen.getByText(/100% of the gap closed/)).toBeInTheDocument();
  });

  it('no previous run or no share: no bar, no image, no percentage', () => {
    const { unmount } = render(<GapBar prevText={null} nowText="0.09" idealText="0.05" closed={50} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText(/gap closed/)).toBeNull();
    unmount();
    render(<GapBar prevText="0.07" nowText="0.09" idealText="0.05" closed={null} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText(/gap closed/)).toBeNull();
  });

  it('compact form shows only the short percentage', () => {
    render(<GapBar prevText="0.07" nowText="0.06" idealText="0.05" closed={56} compact />);
    expect(screen.getByText('0.06 · 56%')).toBeInTheDocument();
    expect(screen.queryByText(/gap closed/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Details screen without runs
// ---------------------------------------------------------------------------

describe('QA: details screen with no runs', () => {
  it('shows one empty state, no table, no lists and no Change first heading', () => {
    at(<DetailsScreen />, { route: '/train/details' });
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Change first' })).toBeNull();
    expect(screen.queryByText('Not measured')).toBeNull();
    expect(screen.queryByText('Keep')).toBeNull();
  });

  it('the Change first column has its No runs yet state', () => {
    at(<ChangeFirstColumn />, { mode: 'tablet', route: '/train' });
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
  });
});
