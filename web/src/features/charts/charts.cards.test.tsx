import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetStores } from '../../test/utils';
import { makeAnalysis, runOne, settingsWith } from '../../test/fixtures';
import type { RunRecord } from '../../types';
import { ConfusionCard } from './ConfusionCard';
import { GradientCard } from './GradientCard';
import { HistogramsCard } from './HistogramsCard';
import { KernelWeightsCard } from './KernelWeightsCard';
import { PerDigitCard } from './PerDigitCard';

beforeEach(resetStores);
afterEach(resetStores);

describe('cards without server data', () => {
  it.each([
    [PerDigitCard, 'Accuracy per digit', /results per digit/],
    [ConfusionCard, 'Confusion matrix', /which digit was read as which/],
    [GradientCard, 'Gradient size per layer', /gradient sizes/],
  ])('%o shows a title and an empty state only', (Card, title, why) => {
    const { container } = render(<Card run={runOne} />);
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByText(why)).toBeInTheDocument();
    expect(container.querySelector('svg, canvas, [role="img"]')).toBeNull();
  });
});

/** 1,000 images per digit. Mistakes: 4 read as 9 (14), 3 read as 5 (12), 7 read as 1 (11), 9 read as 4 (20). */
function sampleConfusion(): number[][] {
  const table: number[][] = Array.from({ length: 10 }, (_, row) => Array.from({ length: 10 }, (_, column) => (row === column ? 1000 : 0)));
  const mistake = (drawn: number, readAs: number, count: number) => {
    table[drawn][readAs] = count;
    table[drawn][drawn] -= count;
  };
  mistake(4, 9, 14);
  mistake(3, 5, 12);
  mistake(7, 1, 11);
  mistake(9, 4, 20);
  return table;
}

function measuredRun(gradients: Record<string, number> = { 'conv 1': 0.02, 'conv 2': 0.01, 'dense 1': 0.005, output: 0.03 }): RunRecord {
  return {
    ...runOne,
    epochs: runOne.epochs.map((epoch) => ({ ...epoch, gradients })),
    results: { ...runOne.results, confusion: sampleConfusion() },
  };
}

describe('PerDigitCard with a confusion table', () => {
  it('draws ten bars, marks the three weakest digits and names them', () => {
    render(<PerDigitCard run={measuredRun()} />);
    expect(screen.getByRole('img', { name: /9 is weakest at 98\.0 percent, 0 is best at 100\.0/ })).toBeInTheDocument();
    expect(screen.getByText('95 – 100%')).toBeInTheDocument();
    expect(screen.getByText(/Weakest here: 9, 4 and 3\./)).toBeInTheDocument();
    expect(screen.queryByText('Not measured')).toBeNull();
    // 98.0% on a 95 to 100 scale is 60% of the height.
    expect(screen.getByTestId('digit-bar-9').style.getPropertyValue('--h')).toMatch(/^60(\.0+)?%$/);
    expect(screen.getByTestId('digit-bar-0').style.getPropertyValue('--h')).toBe('100%');
  });

  it('lowers the start of the scale when a digit is below 95%', () => {
    const run = measuredRun();
    run.results.confusion![2][2] = 880;
    run.results.confusion![2][7] = 120;
    render(<PerDigitCard run={run} />);
    expect(screen.getByText('85 – 100%')).toBeInTheDocument();
  });
});

describe('ConfusionCard with a confusion table', () => {
  it('draws 100 cells and lists the most frequent mistakes', () => {
    const { container } = render(<ConfusionCard run={measuredRun()} />);
    expect(screen.getByRole('img', { name: /Confusion matrix, 10 by 10\. Most frequent mistakes: 9 read as 4, 20 times/ })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid^="cell-"]')).toHaveLength(100);
    const chips = screen.getByRole('list', { name: 'Most frequent mistakes' });
    expect([...chips.children].map((chip) => chip.textContent)).toEqual(['9 → 4 · 20', '4 → 9 · 14', '3 → 5 · 12']);
    // The most frequent mistake is the brightest cell off the diagonal; a pair with no mistakes is nearly dark.
    expect(screen.getByTestId('cell-9-4').style.getPropertyValue('--light')).toBe('0.95');
    expect(screen.getByTestId('cell-0-1').style.getPropertyValue('--light')).toBe('0.04');
    expect(screen.getByTestId('cell-4-9')).toHaveAttribute('title', '4 read as 9: 14');
  });
});

describe('GradientCard with gradient sizes', () => {
  it('draws one dot per layer and says ok when all are in the band', () => {
    render(<GradientCard run={measuredRun()} />);
    expect(screen.getByRole('img', { name: /all sit inside the ideal band/ })).toBeInTheDocument();
    expect(screen.getByText('ok')).toBeInTheDocument();
    for (const name of ['conv 1', 'conv 2', 'dense 1', 'output']) expect(screen.getByText(name)).toBeInTheDocument();
    // 0.01 is 10^-2: 40% of the way from 10^-6 to 10^4.
    expect(screen.getByTestId('gradient-dot-conv 2').style.getPropertyValue('--x')).toBe('40%');
  });

  it('says improve and names the layer when a gradient is outside the band', () => {
    render(<GradientCard run={measuredRun({ 'conv 1': 1e-6, output: 0.03 })} />);
    expect(screen.getByRole('img', { name: /outside the ideal band: conv 1 is vanishing/ })).toBeInTheDocument();
    expect(screen.getByText('improve')).toBeInTheDocument();
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
