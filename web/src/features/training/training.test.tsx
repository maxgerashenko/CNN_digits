import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { LayoutModeProvider } from '../../hooks/useLayoutMode';
import { PaneProvider } from '../../hooks/usePane';
import { makeEpochs, makeFakeModel, settingsWith } from '../../test/fixtures';
import { resetStores } from '../../test/utils';
import { useModelStore } from '../../state/modelStore';
import { useTrainingStore, type TrainingState } from '../../state/trainingStore';
import { CurveGuide } from './CurveGuide';
import { MetricCard, verdictFor } from './MetricCard';
import { TrainingActions } from './TrainingActions';
import { TrainingScreen } from './TrainingScreen';
import { TrainingStatus } from './TrainingStatus';

const settings = settingsWith({ epochs: 2 });
const row = (valAccuracy: number, valLoss: number, seconds: number) => ({
  accuracy: valAccuracy - 0.02,
  loss: valLoss + 0.05,
  valAccuracy,
  valLoss,
  seconds,
});

function setTraining(patch: Partial<TrainingState>) {
  act(() => useTrainingStore.setState(patch));
}

function wrap(ui: React.ReactNode, { pane = false } = {}) {
  const inner = pane ? <PaneProvider>{ui}</PaneProvider> : ui;
  return render(
    <LayoutModeProvider mode="phone">
      <MemoryRouter initialEntries={['/train/run']}>
        <Routes>
          <Route path="/train/run" element={inner} />
          <Route path="/train" element={<p>settings page</p>} />
          <Route path="/" element={<p>recognize page</p>} />
          <Route path="*" element={<p>other page</p>} />
        </Routes>
      </MemoryRouter>
    </LayoutModeProvider>,
  );
}

beforeEach(() => resetStores());

describe('TrainingStatus', () => {
  it('waking, queued', () => {
    setTraining({ phase: 'waking', jobSettings: settings });
    wrap(<TrainingStatus />);
    expect(screen.getByText('Server is starting, about 1 minute')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    setTraining({ phase: 'queued', position: 2 });
    expect(screen.getByText('In line, place 2')).toBeInTheDocument();
    setTraining({ phase: 'queued', position: 0 });
    expect(screen.getByText('Starting the run')).toBeInTheDocument();
  });

  it('running shows epoch, elapsed seconds, estimate and progress by finished epochs', () => {
    setTraining({ phase: 'running', jobSettings: settings, startedAt: Date.now() - 38_000, epochs: [] });
    wrap(<TrainingStatus />);
    expect(screen.getByText('Epoch 1 / 2')).toBeInTheDocument();
    expect(screen.getByText(/^3\d s · about/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    setTraining({ epochs: makeEpochs([row(0.96, 0.14, 29)]) });
    expect(screen.getByText('Epoch 2 / 2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });

  it('finishing, done, stopped, error', () => {
    setTraining({ phase: 'finishing', jobSettings: settings, epochs: makeEpochs([row(0.96, 0.14, 29), row(0.97, 0.1, 58)]) });
    wrap(<TrainingStatus />);
    expect(screen.getByText('Loading the new model')).toBeInTheDocument();
    setTraining({ phase: 'done' });
    expect(screen.getByText('Training done')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    setTraining({ phase: 'stopped' });
    expect(screen.getByText('Training stopped')).toBeInTheDocument();
    setTraining({ phase: 'error', error: 'Too many images for the time limit.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Too many images for the time limit.');
  });

  it('shows the legend', () => {
    wrap(<TrainingStatus />);
    expect(screen.getByText('your network')).toBeInTheDocument();
    expect(screen.getByText('ideal shape')).toBeInTheDocument();
    expect(screen.getByText('goal')).toBeInTheDocument();
  });
});

describe('MetricCard', () => {
  it('works with 0 epochs: no value, no verdict', () => {
    setTraining({ phase: 'running', jobSettings: settings });
    wrap(<MetricCard metric="accuracy" />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('on track')).toBeNull();
    expect(screen.getByText('goal 99.58%')).toBeInTheDocument();
  });

  it('1 epoch: value and distance, no verdict', () => {
    setTraining({ phase: 'running', jobSettings: settings, epochs: makeEpochs([row(0.96, 0.14, 29)]) });
    wrap(
      <>
        <MetricCard metric="accuracy" />
        <MetricCard metric="loss" />
      </>,
    );
    expect(screen.getByText('96.0%')).toBeInTheDocument();
    expect(screen.getByText('3.58 to go')).toBeInTheDocument();
    expect(screen.getByText('0.14')).toBeInTheDocument();
    expect(screen.getByText('goal near 0')).toBeInTheDocument();
    expect(screen.queryByText('on track')).toBeNull();
  });

  it('on track while accuracy rises and loss falls', () => {
    setTraining({ jobSettings: settings, epochs: makeEpochs([row(0.96, 0.14, 29), row(0.97, 0.1, 58)]) });
    wrap(
      <>
        <MetricCard metric="accuracy" />
        <MetricCard metric="loss" />
      </>,
    );
    expect(screen.getAllByText('on track')).toHaveLength(2);
  });

  it('verdict rule', () => {
    expect(verdictFor('accuracy', [0.9])).toBeNull();
    expect(verdictFor('accuracy', [0.9, 0.95])).toBe('on track');
    expect(verdictFor('accuracy', [0.95, 0.9])).toBe('off track');
    expect(verdictFor('loss', [0.3, 0.2])).toBe('on track');
    expect(verdictFor('loss', [0.2, 0.3])).toBe('off track');
  });

  it('five epochs draw a chart', () => {
    const five = makeEpochs([0.9, 0.94, 0.96, 0.97, 0.98].map((a, i) => row(a, 0.3 - i * 0.05, 10 * (i + 1))));
    setTraining({ jobSettings: settingsWith({ epochs: 5 }), epochs: five });
    wrap(<MetricCard metric="accuracy" />);
    expect(screen.getByRole('img')).toHaveAccessibleName(/5 of 5 epochs so far, latest 98.0%/);
  });
});

describe('CurveGuide', () => {
  it('lists the four cases', () => {
    wrap(<CurveGuide />);
    expect(screen.getByRole('heading', { name: 'If the curve looks different' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Jumps up and down')).toBeInTheDocument();
    expect(screen.getByText('Overfitting. Raise dropout or turn on augmentation.')).toBeInTheDocument();
  });
});

describe('TrainingActions', () => {
  it('retrained button is disabled until done', () => {
    setTraining({ phase: 'running', jobSettings: settings });
    wrap(<TrainingActions />);
    expect(screen.getByRole('button', { name: 'Use my retrained model' })).toBeDisabled();
  });

  it('done: uses the retrained model and goes to the first screen', async () => {
    const model = makeFakeModel();
    act(() => useModelStore.getState().setRetrained(model, 'job-1'));
    setTraining({ phase: 'done', jobSettings: settings });
    wrap(<TrainingActions />);
    await userEvent.click(screen.getByRole('button', { name: 'Use my retrained model' }));
    expect(useModelStore.getState().active).toBe('retrained');
    expect(screen.getByText('recognize page')).toBeInTheDocument();
  });

  it('stop calls stop() and returns to settings', async () => {
    setTraining({ phase: 'running', jobSettings: settings });
    wrap(<TrainingActions />);
    await userEvent.click(screen.getByRole('button', { name: 'Stop training' }));
    expect(useTrainingStore.getState().phase).toBe('stopped');
    expect(screen.getByText('settings page')).toBeInTheDocument();
  });

  it.each(['error', 'stopped'] as const)('after %s: back to settings resets', async (phase) => {
    setTraining({ phase, jobSettings: settings, error: phase === 'error' ? 'x' : null });
    wrap(<TrainingActions />);
    await userEvent.click(screen.getByRole('link', { name: 'Back to settings' }));
    expect(useTrainingStore.getState().phase).toBe('idle');
    expect(screen.getByText('settings page')).toBeInTheDocument();
  });
});

describe('TrainingScreen', () => {
  it('phone: has All metrics link and back link', () => {
    setTraining({ phase: 'running', jobSettings: settings });
    wrap(<TrainingScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'Training' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /All metrics/ })).toHaveAttribute('href', '/train/details');
    expect(screen.getByRole('link', { name: 'Back to settings' })).toBeInTheDocument();
  });

  it('pane: no All metrics link', () => {
    setTraining({ phase: 'running', jobSettings: settings });
    wrap(<TrainingScreen />, { pane: true });
    expect(screen.queryByRole('link', { name: /All metrics/ })).toBeNull();
  });
});
