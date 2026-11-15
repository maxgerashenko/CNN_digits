import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useTrainingStore } from '../../state/trainingStore';
import { resetStores } from '../../test/utils';
import { makeAnalysis, runOne, settingsWith } from '../../test/fixtures';
import type { RunRecord } from '../../types';
import { ConfusionCard } from './ConfusionCard';
import { GradientCard } from './GradientCard';
import { HistogramsCard } from './HistogramsCard';
import { KernelWeightsCard } from './KernelWeightsCard';
import { PerDigitCard } from './PerDigitCard';

function withRun(run: RunRecord) {
  useTrainingStore.setState({ runs: [run] });
}

beforeEach(resetStores);
afterEach(resetStores);

describe('cards without server data', () => {
  it.each([
    [PerDigitCard, 'Accuracy per digit', /results per digit/],
    [ConfusionCard, 'Confusion matrix', /which digit was read as which/],
    [GradientCard, 'Gradient size per layer', /gradient sizes/],
  ])('%o shows a title and an empty state only', (Card, title, why) => {
    withRun(runOne);
    const { container } = render(<Card />);
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByText(why)).toBeInTheDocument();
    expect(container.querySelector('svg, canvas, [role="img"]')).toBeNull();
  });
});

describe('KernelWeightsCard', () => {
  it('shows an empty state without analysis', () => {
    render(<KernelWeightsCard run={{ ...runOne, analysis: null }} />);
    expect(screen.getByText('Not measured')).toBeInTheDocument();
  });

  it('shows one histogram per layer', () => {
    render(<KernelWeightsCard run={runOne} />);
    const layers = runOne.analysis!.layers;
    expect(layers.length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img')).toHaveLength(layers.length);
    for (const layer of layers) expect(screen.getByText(layer.name)).toBeInTheDocument();
  });
});

describe('HistogramsCard', () => {
  it('shows an empty state when the run holds no weights', () => {
    render(<HistogramsCard run={{ ...runOne, analysis: null }} />);
    expect(screen.getByText('Not measured')).toBeInTheDocument();
  });

  it('shows one row per tag with batch norm on, and says last epoch only', () => {
    render(<HistogramsCard run={runOne} />);
    const tags = runOne.analysis!.tags;
    expect(screen.getAllByRole('img')).toHaveLength(tags.length);
    expect(screen.getByText('last epoch only')).toBeInTheDocument();
    expect(screen.getByText('gamma')).toBeInTheDocument();
  });

  it('leaves out the batch norm rows with batch norm off', () => {
    render(<HistogramsCard run={{ ...runOne, settings: settingsWith({ batch_norm: false }), analysis: makeAnalysis() }} />);
    expect(screen.queryByText('gamma')).toBeNull();
    expect(screen.queryByText('beta')).toBeNull();
    expect(screen.getByText('kernel')).toBeInTheDocument();
  });
});
