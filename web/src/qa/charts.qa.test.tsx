// QA for the Raw charts screen (ARCHITECTURE.md sections 9 and 13, P9 and P10).
// Checks what the coders' own tests do not: card order, KPI values for other run
// lengths, sentences built from the run's numbers, empty states, edge data.

import { render, screen, within } from '@testing-library/react';
import { act } from 'react';

import { HistogramShape } from '../features/charts/HistogramShape';
import { formatLoss } from '../lib/format';
import { analyzeWeights } from '../model/weightStats';
import { useTrainingStore } from '../state/trainingStore';
import { makeAnalysis, makeEpochs, runOne, runTwo, settingsWith } from '../test/fixtures';
import { renderApp, resetStores } from '../test/utils';
import type { Histogram, RunRecord } from '../types';

beforeEach(() => resetStores());

const CHART_HEADINGS = [
  'Accuracy, train vs validation',
  'Loss, train vs validation',
  'Accuracy per digit',
  'Confusion matrix',
  'Kernel weights per layer',
  'Histograms over epochs',
  'Gradient size per layer',
];

const GAP_HEADINGS = ['Accuracy per digit', 'Confusion matrix', 'Gradient size per layer'];

function loadRuns(...runs: RunRecord[]) {
  act(() => useTrainingStore.setState({ runs }));
}

/** The card (section) that holds a heading. */
function cardOf(heading: string): HTMLElement {
  return screen.getByRole('heading', { name: heading }).closest('section') as HTMLElement;
}

function imageLabels(root: ParentNode): string[] {
  return [...root.querySelectorAll('[role="img"]')].map((el) => el.getAttribute('aria-label') ?? '');
}

function pathData(root: ParentNode): string[] {
  return [...root.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '');
}

/** A run built from `rows` (one per epoch). The results follow the last row. */
function runFromRows(rows: Parameters<typeof makeEpochs>[0], changes: Partial<RunRecord> = {}): RunRecord {
  const last = rows[rows.length - 1];
  return {
    ...runOne,
    epochs: makeEpochs(rows),
    settings: settingsWith({ epochs: rows.length }),
    results: {
      ...runOne.results,
      epochs: rows.length,
      accuracy: last.accuracy,
      loss: last.loss,
      valAccuracy: last.valAccuracy,
      valLoss: last.valLoss,
    },
    ...changes,
  };
}

const TWO_ROWS = [
  { accuracy: 0.9, loss: 0.33, valAccuracy: 0.96, valLoss: 0.14, seconds: 29 },
  { accuracy: 0.965, loss: 0.11, valAccuracy: 0.979, valLoss: 0.07, seconds: 58 },
];

const FIVE_ROWS = [
  { accuracy: 0.9, loss: 0.33, valAccuracy: 0.96, valLoss: 0.14, seconds: 30 },
  { accuracy: 0.965, loss: 0.11, valAccuracy: 0.979, valLoss: 0.07, seconds: 60 },
  { accuracy: 0.978, loss: 0.07, valAccuracy: 0.9845, valLoss: 0.052, seconds: 90 },
  { accuracy: 0.983, loss: 0.055, valAccuracy: 0.9862, valLoss: 0.048, seconds: 120 },
  { accuracy: 0.987, loss: 0.045, valAccuracy: 0.9871, valLoss: 0.044, seconds: 152 },
];

describe('Raw charts screen: card order and runs', () => {
  it('places all seven cards in the artboard order', () => {
    loadRuns(runOne);
    renderApp({ route: '/train/charts' });
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(CHART_HEADINGS);
  });

  it('puts the KPI strip and the legend above the first card', () => {
    loadRuns(runOne);
    const { container } = renderApp({ route: '/train/charts' });
    const strip = container.querySelector('dl');
    const legendText = screen.getByText('validation');
    const firstCard = screen.getByRole('heading', { name: CHART_HEADINGS[0] });
    expect(strip).not.toBeNull();
    expect(strip!.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(legendText.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows one empty state and nothing else without runs', () => {
    renderApp({ route: '/train/charts' });
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    expect(screen.queryByText('val acc')).toBeNull();
    expect(screen.queryByText('validation')).toBeNull();
    for (const heading of CHART_HEADINGS) expect(screen.queryByRole('heading', { name: heading })).toBeNull();
  });

  it('shows Not measured for both weight cards when analysis is null, and the curves still draw', () => {
    loadRuns({ ...runOne, analysis: null });
    renderApp({ route: '/train/charts' });
    expect(cardOf('Kernel weights per layer')).toHaveTextContent('Not measured');
    expect(cardOf('Histograms over epochs')).toHaveTextContent('Not measured');
    expect(imageLabels(cardOf('Kernel weights per layer'))).toEqual([]);
    expect(imageLabels(cardOf('Histograms over epochs'))).toEqual([]);
    expect(screen.getByRole('img', { name: /Accuracy, train vs validation/ })).toBeInTheDocument();
    // Two weight cards plus the three gap cards.
    expect(screen.getAllByText('Not measured')).toHaveLength(5);
  });

  it('shows Not measured for both weight cards when the analysis has no layers or tags', () => {
    loadRuns({ ...runOne, analysis: makeAnalysis({ layers: [], tags: [] }) });
    renderApp({ route: '/train/charts' });
    expect(cardOf('Kernel weights per layer')).toHaveTextContent('Not measured');
    expect(cardOf('Histograms over epochs')).toHaveTextContent('Not measured');
    expect(imageLabels(cardOf('Histograms over epochs'))).toEqual([]);
  });

  it('removes the batch norm histogram rows on the screen with batch norm off', () => {
    loadRuns({ ...runOne, settings: settingsWith({ batch_norm: false }), analysis: makeAnalysis() });
    renderApp({ route: '/train/charts' });
    const labels = imageLabels(cardOf('Histograms over epochs'));
    expect(labels).toHaveLength(1);
    expect(labels[0]).toContain('kernel histogram');
    for (const word of ['gamma', 'beta', 'moving_mean', 'moving_variance']) {
      expect(screen.queryByText(word)).toBeNull();
    }
    expect(cardOf('Histograms over epochs')).toHaveTextContent(
      'gamma, beta and both moving charts exist only with batch norm on',
    );
  });

  it('shows one histogram row per tag of the analysis with batch norm on, in analysis order', () => {
    loadRuns(runOne);
    renderApp({ route: '/train/charts' });
    const tags = runOne.analysis!.tags.map((t) => t.tag);
    const labels = imageLabels(cardOf('Histograms over epochs'));
    expect(labels).toHaveLength(tags.length);
    tags.forEach((tag, i) => expect(labels[i]).toContain(`${tag} histogram of the last epoch`));
    expect(cardOf('Histograms over epochs')).toHaveTextContent('last epoch only');
  });
});

describe('KPI strip values', () => {
  it('shows val acc 97.9%, 210 mistakes, 29 s per epoch and lr 0.001 for the 2-epoch run one', () => {
    loadRuns(runOne);
    const { container } = renderApp({ route: '/train/charts' });
    const cells = [...container.querySelectorAll('dl > div')];
    expect(cells).toHaveLength(4);
    const values = cells.map((c) => [c.querySelector('dt')?.textContent, c.querySelector('dd')?.textContent]);
    expect(values).toEqual([
      ['val acc', '97.9%'],
      ['mistakes', '210'],
      ['s / epoch', '29'],
      ['lr', '0.001'],
    ]);
  });

  it('shows the values of a 1-epoch run', () => {
    const one = runFromRows([{ ...TWO_ROWS[1], seconds: 31 }], {
      results: { ...runOne.results, epochs: 1, trainingSeconds: 31, valAccuracy: 0.9512, mistakes: 488 },
    } as Partial<RunRecord>);
    loadRuns(one);
    const { container } = renderApp({ route: '/train/charts' });
    const values = [...container.querySelectorAll('dl > div')].map((c) => c.querySelector('dd')?.textContent);
    expect(values).toEqual(['95.1%', '488', '31', '0.001']);
  });

  it('shows the values of a 5-epoch run with its own learning rate', () => {
    const five = runFromRows(FIVE_ROWS, {
      settings: settingsWith({ epochs: 5, learning_rate: 0.0001 }),
      results: {
        ...runOne.results,
        epochs: 5,
        trainingSeconds: 152,
        valAccuracy: 0.9871,
        mistakes: 129,
      },
    } as Partial<RunRecord>);
    loadRuns(five);
    const { container } = renderApp({ route: '/train/charts' });
    const values = [...container.querySelectorAll('dl > div')].map((c) => c.querySelector('dd')?.textContent);
    // 152 s over 5 epochs is 30.4 s, shown as 30.
    expect(values).toEqual(['98.7%', '129', '30', '0.0001']);
  });

  it('shows a dash for seconds per epoch when the run time is not a number', () => {
    const bad = runFromRows(
      TWO_ROWS.map((row) => ({ ...row, seconds: Number.NaN })),
      {
        results: { ...runOne.results, trainingSeconds: Number.NaN },
      } as Partial<RunRecord>,
    );
    loadRuns(bad);
    const { container } = renderApp({ route: '/train/charts' });
    const values = [...container.querySelectorAll('dl > div')].map((c) => c.querySelector('dd')?.textContent);
    expect(values[2]).toBe('–');
  });
});

describe('curve cards', () => {
  it('fills the sentences under the curves with the run 1 numbers', () => {
    loadRuns(runOne);
    renderApp({ route: '/train/charts' });
    const acc = cardOf('Accuracy, train vs validation');
    expect(acc).toHaveTextContent('Here: train 96.5%, validation 97.9%, goal 99.53%.');
    // Validation rose in the last epoch and is still under the goal.
    expect(acc).toHaveTextContent('Still rising, more epochs would help.');
    const loss = cardOf('Loss, train vs validation');
    expect(loss).toHaveTextContent('Here: train 0.11, validation 0.07.');
    expect(loss).not.toHaveTextContent('Validation turned up');
  });

  it('fills the sentences with the run 2 numbers, not run 1', () => {
    loadRuns(runTwo);
    renderApp({ route: '/train/charts' });
    expect(cardOf('Accuracy, train vs validation')).toHaveTextContent('Here: train 98.3%, validation 98.6%, goal 99.53%.');
    expect(cardOf('Loss, train vs validation')).toHaveTextContent(
      `Here: train ${formatLoss(0.055)}, validation ${formatLoss(0.048)}.`,
    );
    expect(cardOf('Accuracy, train vs validation')).not.toHaveTextContent('96.5%');
  });

  it('says validation turned up while train fell only when that happened in the last epoch', () => {
    const turned = runFromRows([
      { accuracy: 0.9, loss: 0.5, valAccuracy: 0.95, valLoss: 0.3, seconds: 10 },
      { accuracy: 0.95, loss: 0.3, valAccuracy: 0.97, valLoss: 0.2, seconds: 20 },
      { accuracy: 0.97, loss: 0.2, valAccuracy: 0.96, valLoss: 0.25, seconds: 30 },
    ]);
    loadRuns(turned);
    renderApp({ route: '/train/charts' });
    expect(cardOf('Loss, train vs validation')).toHaveTextContent(
      'Validation turned up in the last epoch while train fell.',
    );
  });

  it('does not add "still rising" when validation accuracy fell in the last epoch', () => {
    const falling = runFromRows([
      { accuracy: 0.9, loss: 0.5, valAccuracy: 0.95, valLoss: 0.3, seconds: 10 },
      { accuracy: 0.95, loss: 0.3, valAccuracy: 0.97, valLoss: 0.2, seconds: 20 },
      { accuracy: 0.97, loss: 0.2, valAccuracy: 0.96, valLoss: 0.25, seconds: 30 },
    ]);
    loadRuns(falling);
    renderApp({ route: '/train/charts' });
    expect(cardOf('Accuracy, train vs validation')).not.toHaveTextContent('Still rising');
  });

  it('works with a 1-epoch run: draws the points, no crash, no comparison sentence', () => {
    const one = runFromRows([TWO_ROWS[0]]);
    loadRuns(one);
    renderApp({ route: '/train/charts' });
    const acc = cardOf('Accuracy, train vs validation');
    expect(acc).toHaveTextContent('Here: train 90.0%, validation 96.0%, goal 99.53%.');
    expect(acc).not.toHaveTextContent('Still rising');
    expect(cardOf('Loss, train vs validation')).toHaveTextContent('Here: train 0.33, validation 0.14.');
  });

  it('labels the chart with the run length for a 5-epoch run', () => {
    loadRuns(runFromRows(FIVE_ROWS));
    renderApp({ route: '/train/charts' });
    expect(screen.getByRole('img', { name: /Accuracy, train vs validation: train 98\.7%, validation 98\.7% after 5 epochs/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Loss, train vs validation: train 0\.04, validation 0\.04 after 5 epochs/ })).toBeInTheDocument();
  });

  it('draws the dashed ideal shape inside each curve card', () => {
    loadRuns(runOne);
    renderApp({ route: '/train/charts' });
    for (const heading of ['Accuracy, train vs validation', 'Loss, train vs validation']) {
      const ideal = cardOf(heading).querySelectorAll('path.ideal');
      expect(ideal).toHaveLength(1);
      expect(ideal[0].getAttribute('d')).not.toMatch(/NaN|Infinity/);
    }
  });

  it('shows a status word from the matching check: ok on the loss card of a smooth run', () => {
    loadRuns(runTwo);
    renderApp({ route: '/train/charts' });
    expect(within(cardOf('Loss, train vs validation')).getByText('ok')).toBeInTheDocument();
  });
});

describe('cards without server data on the screen', () => {
  it.each(GAP_HEADINGS)('%s has a title, an empty state and no bars, cells, dots or numbers', (heading) => {
    loadRuns(runOne);
    renderApp({ route: '/train/charts' });
    const card = cardOf(heading);
    expect(card).toHaveTextContent('Not measured');
    expect(card.querySelector('svg, canvas, [role="img"], [role="grid"], [role="table"], [role="gridcell"], table, ul, ol, li')).toBeNull();
    expect(card.textContent).not.toMatch(/\d|%/);
  });

  it('keeps the gap cards empty even when the analysis is null', () => {
    loadRuns({ ...runOne, analysis: null });
    renderApp({ route: '/train/charts' });
    for (const heading of GAP_HEADINGS) {
      expect(cardOf(heading).querySelector('svg, [role="img"]')).toBeNull();
    }
  });
});

describe('weight edge data', () => {
  it('draws the kernel card with one labelled histogram per layer and the layer names', () => {
    loadRuns(runOne);
    renderApp({ route: '/train/charts' });
    const card = cardOf('Kernel weights per layer');
    const names = runOne.analysis!.layers.map((l) => l.name);
    const labels = imageLabels(card);
    expect(labels).toHaveLength(names.length);
    names.forEach((name, i) => {
      expect(labels[i]).toMatch(new RegExp(`^${name} weights, from -?\\d+\\.\\d{2} to -?\\d+\\.\\d{2}$`));
      expect(card).toHaveTextContent(name);
    });
  });

  it('shows the ok chip for a bell and improve for a flat dense layer, and no chip when unknown', () => {
    const cases: [boolean | null, string | null][] = [
      [true, 'ok'],
      [false, 'improve'],
      [null, null],
    ];
    for (const [denseBell, word] of cases) {
      resetStores();
      loadRuns({ ...runOne, analysis: makeAnalysis({ denseBell }) });
      const { unmount } = renderApp({ route: '/train/charts' });
      const card = cardOf('Kernel weights per layer');
      const chips = [...card.querySelectorAll('span')].map((el) => el.textContent);
      if (word === null) {
        expect(chips).not.toContain('ok');
        expect(chips).not.toContain('improve');
      } else {
        expect(within(card).getByText(word)).toBeInTheDocument();
      }
      unmount();
    }
  });

  it('draws no NaN and no ideal bell when every weight is equal', () => {
    const flat = analyzeWeights([
      { layer: 'conv 1', kind: 'conv', tag: 'kernel', shape: [3, 3, 1, 1], values: new Float32Array(9).fill(0.5) },
      { layer: 'norm 1', kind: 'norm', tag: 'gamma', shape: [1], values: new Float32Array(1).fill(1) },
      { layer: 'dense', kind: 'dense', tag: 'kernel', shape: [2, 2], values: new Float32Array(4).fill(0) },
    ]);
    loadRuns({ ...runOne, analysis: flat });
    const { container } = renderApp({ route: '/train/charts' });
    for (const d of pathData(container)) expect(d).not.toMatch(/NaN|Infinity/);
    expect(container.textContent).not.toMatch(/NaN|undefined/);
    // Zero spread: no bell can be drawn, so no ideal path. The gamma row is all 1 (spread 0).
    // The pooled kernel row has real spread, so its bell is drawn.
    expect(cardOf('Kernel weights per layer').querySelectorAll('path.ideal')).toHaveLength(0);
    const rows = [...cardOf('Histograms over epochs').querySelectorAll('li')];
    const rowFor = (tag: string) => rows.find((li) => li.querySelector('[role="img"]')?.getAttribute('aria-label')?.includes(`${tag} histogram`));
    const gamma = rowFor('gamma');
    const kernel = rowFor('kernel');
    expect(gamma).toBeDefined();
    expect(gamma!.querySelectorAll('path.ideal')).toHaveLength(0);
    expect(kernel!.querySelectorAll('path.ideal')).toHaveLength(1);
  });

  it('draws no NaN for a layer with no weights', () => {
    const empty = analyzeWeights([
      { layer: 'conv 1', kind: 'conv', tag: 'kernel', shape: [0], values: new Float32Array(0) },
      { layer: 'conv 2', kind: 'conv', tag: 'kernel', shape: [3, 3, 1, 1], values: new Float32Array(9).fill(0.2) },
    ]);
    loadRuns({ ...runOne, analysis: empty });
    const { container } = renderApp({ route: '/train/charts' });
    for (const d of pathData(container)) expect(d).not.toMatch(/NaN|Infinity/);
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });

  it('HistogramShape draws no NaN for an empty histogram or a flat one', () => {
    const empty: Histogram = { lo: 0, hi: 0, bins: [], count: 0, mean: 0, std: 0 };
    const { container: a } = render(
      <HistogramShape histogram={empty} variant="ridge" idealCentre={0} label="empty" />,
    );
    for (const d of pathData(a)) expect(d).not.toMatch(/NaN|Infinity/);
    expect(a.querySelectorAll('path.ideal')).toHaveLength(0);

    const zeros: Histogram = { lo: 0.5, hi: 0.5, bins: new Array(24).fill(0), count: 4, mean: 0.5, std: 0 };
    const { container: b } = render(<HistogramShape histogram={zeros} variant="line" idealCentre={1} label="zeros" />);
    for (const d of pathData(b)) expect(d).not.toMatch(/NaN|Infinity/);
    expect(b.querySelectorAll('path.ideal')).toHaveLength(0);
  });
});
