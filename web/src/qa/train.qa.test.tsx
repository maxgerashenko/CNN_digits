// QA for the Train configure screen (P3, P4, P5). Written by the tester, not
// the coders: these checks go past the tests next to the components.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkDiagram } from '../features/train/NetworkDiagram';
import { buildNetworkGeometry, DIAGRAM_HEIGHT, DIAGRAM_WIDTH } from '../features/train/networkGeometry';
import { SettingsPanel } from '../features/train/SettingsPanel';
import { StartTrainingButton } from '../features/train/StartTrainingButton';
import { LayoutModeProvider } from '../hooks/useLayoutMode';
import { countParams } from '../lib/architecture';
import { evaluateChecks } from '../lib/checks';
import { formatInt } from '../lib/format';
import { isAllowed, SETTING_SPECS, formatSetting, type SettingSpec } from '../lib/settings';
import { useSettingsStore } from '../state/settingsStore';
import { configureTraining, NOT_CONFIGURED_TEXT, useTrainingStore, type TrainingPhase } from '../state/trainingStore';
import { runOne, runTwo, settingsWith, sampleRuns } from '../test/fixtures';
import { renderApp, resetStores } from '../test/utils';
import type { SettingKey, Settings } from '../types';

beforeEach(() => {
  resetStores();
  configureTraining({});
});

const val = (key: SettingKey) => useSettingsStore.getState().settings[key];
const rowOf = (container: HTMLElement, key: SettingKey) => container.querySelector(`[data-setting="${key}"]`) as HTMLElement;
const follows = (first: Node, second: Node) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

function renderConfigure(mode: 'phone' | 'desktop' = 'phone') {
  return renderApp({ route: '/train', mode });
}

describe('every setting can be changed from the screen', () => {
  it.each(SETTING_SPECS.map((spec) => [spec.key, spec.control] as const))('%s (%s) changes and stays allowed', (key, control) => {
    const { container } = render(<SettingsPanel />);
    const row = rowOf(container, key);
    const spec = SETTING_SPECS.find((s) => s.key === key) as SettingSpec;
    const before = val(key);

    if (control === 'stepper') {
      const more = within(row).getByRole('button', { name: `${spec.label}: more` });
      const less = within(row).getByRole('button', { name: `${spec.label}: less` });
      fireEvent.click(more.hasAttribute('disabled') ? less : more);
    } else if (control === 'segmented') {
      const other = spec.choices!.find((choice) => choice !== before)!;
      fireEvent.click(within(row).getByRole('button', { name: formatSetting(key, other) }));
    } else if (control === 'slider') {
      fireEvent.change(within(row).getByRole('slider', { name: spec.label }), { target: { value: '0.3' } });
    } else {
      fireEvent.click(within(row).getByRole('switch', { name: spec.label }));
    }

    expect(val(key)).not.toBe(before);
    expect(isAllowed(key, val(key))).toBe(true);
  });
});

describe('ranges hold at both ends', () => {
  it.each([
    ['Conv blocks', 'conv_blocks', 1, 3],
    ['Conv layers per block', 'conv_layers_per_block', 1, 3],
    ['Hidden dense layers', 'dense_layers', 0, 2],
    ['Epochs', 'epochs', 1, 20],
  ] as const)('%s stops at %i and %i, with the buttons switched off there', (label, key, min, max) => {
    const { container } = render(<SettingsPanel />);
    const more = () => within(rowOf(container, key)).getByRole('button', { name: `${label}: more` });
    const less = () => within(rowOf(container, key)).getByRole('button', { name: `${label}: less` });

    for (let i = 0; i < 25; i++) if (!more().hasAttribute('disabled')) fireEvent.click(more());
    expect(val(key)).toBe(max);
    expect(more()).toBeDisabled();

    for (let i = 0; i < 25; i++) if (!less().hasAttribute('disabled')) fireEvent.click(less());
    expect(val(key)).toBe(min);
    expect(less()).toBeDisabled();
  });

  it('dropout slider runs 0 to 0.5 in steps of 0.1 and each step sticks', () => {
    const { container } = render(<SettingsPanel />);
    const slider = within(rowOf(container, 'dropout')).getByRole('slider', { name: 'Dropout' }) as HTMLInputElement;
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('0.5');
    expect(slider.step).toBe('0.1');
    for (const v of ['0', '0.1', '0.2', '0.3', '0.4', '0.5']) {
      fireEvent.change(slider, { target: { value: v } });
      expect(val('dropout')).toBeCloseTo(Number(v), 10);
    }
  });

  it('the store refuses values the server would refuse (and cleans float noise)', () => {
    const before = { ...useSettingsStore.getState().settings };
    const bad: [SettingKey, unknown][] = [
      ['epochs', 21],
      ['epochs', 0],
      ['conv_blocks', 0],
      ['conv_blocks', 4],
      ['dropout', 0.6],
      ['dropout', -0.1],
      ['dropout', Number.NaN],
      ['kernel_size', 4],
      ['filters', 12],
      ['dense_units', 100],
      ['batch_size', 16],
      ['train_images', 4000],
      ['train_images', 70000],
      ['learning_rate', 0.1],
      ['augmentation', 0.2],
      ['batch_norm', 'yes'],
      ['epochs', Number.POSITIVE_INFINITY],
    ];
    for (const [key, value] of bad) {
      useSettingsStore.getState().setSetting(key, value as never);
    }
    expect(useSettingsStore.getState().settings).toEqual(before);

    useSettingsStore.getState().setSetting('dropout', 0.30000000000000004 as never);
    expect(val('dropout')).toBe(0.3);
  });

  it('applySettings keeps the good values of a batch and drops the bad ones', () => {
    useSettingsStore.getState().applySettings({ epochs: 4, kernel_size: 7 as never, dropout: 0.2 });
    expect(val('epochs')).toBe(4);
    expect(val('kernel_size')).toBe(3);
    expect(val('dropout')).toBe(0.2);
  });
});

describe('the network diagram at the extremes and with switches off', () => {
  it('smallest network: 7,902 weights, one block, no dense labels', () => {
    const s = settingsWith({ conv_blocks: 1, conv_layers_per_block: 1, dense_layers: 0, filters: 4, kernel_size: 3, batch_norm: true });
    // Hand count: conv 3*3*1*4 + 4*4 BN = 52; dense head 14*14*4 = 784 inputs to 10 outputs: 7840 + 10.
    expect(countParams(s)).toBe(7902);
    render(<NetworkDiagram settings={s} />);
    expect(screen.getByText('7,902')).toBeInTheDocument();
    expect(screen.getByText('28 → 14')).toBeInTheDocument();
    expect(screen.getByText('4@14')).toBeInTheDocument();
    expect(screen.queryByText('Dense')).toBeNull();
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Network: input 28 by 28, 1 conv block with 1 conv layer each, no hidden dense layers, 10 outputs',
    );
  });

  it('largest network: 1,699,754 weights, three blocks, two dense layers', () => {
    const s = settingsWith({
      conv_blocks: 3,
      conv_layers_per_block: 3,
      dense_layers: 2,
      filters: 32,
      kernel_size: 5,
      dense_units: 256,
      batch_norm: true,
    });
    // Hand count per block (kernel 5, BN): B1 32f 3 layers 52384; B2 64f 256768; B3 128f 1025536.
    // Head: 3*3*128 = 1152 -> 256 (295936) -> 256 (66560) -> 10 (2570).
    expect(countParams(s)).toBe(1699754);
    render(<NetworkDiagram settings={s} />);
    expect(screen.getByText('1,699,754')).toBeInTheDocument();
    expect(screen.getByText('28 → 14 → 7 → 3')).toBeInTheDocument();
    for (const t of ['B1', '32@14', 'B2', '64@7', 'B3', '128@3', 'Out', '10']) {
      expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText('Dense')).toHaveLength(2);
    expect(screen.getAllByText('256')).toHaveLength(2);
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Network: input 28 by 28, 3 conv blocks with 3 conv layers each, 2 hidden dense layers of 256, 10 outputs',
    );
  });

  it.each([
    ['default', settingsWith()],
    ['smallest', settingsWith({ conv_blocks: 1, conv_layers_per_block: 1, dense_layers: 0, filters: 4 })],
    ['largest', settingsWith({ conv_blocks: 3, conv_layers_per_block: 3, dense_layers: 2, filters: 32, kernel_size: 5, dense_units: 256 })],
  ])('%s network: every shape sits inside the 332 x 164 box', (_name, s) => {
    const geo = buildNetworkGeometry(s);
    const inBox = (x: number, y: number) => x >= 0 && x <= DIAGRAM_WIDTH && y >= 0 && y <= DIAGRAM_HEIGHT;
    for (const r of geo.rects) {
      expect(inBox(r.x, r.y)).toBe(true);
      expect(inBox(r.x + r.size, r.y + r.size)).toBe(true);
    }
    for (const d of geo.dots) {
      expect(inBox(d.x - d.size / 2, d.y - d.size / 2)).toBe(true);
      expect(inBox(d.x + d.size / 2, d.y + d.size / 2)).toBe(true);
    }
    for (const l of geo.lines) {
      expect(inBox(l.x1, l.y1)).toBe(true);
      expect(inBox(l.x2, l.y2)).toBe(true);
    }
  });

  it('batch norm off: 218,490 weights and dashed block outlines in the DOM', () => {
    const off = settingsWith({ batch_norm: false });
    // Without BN each conv and dense layer has a bias instead of 4 BN numbers per unit: 3 numbers fewer per unit.
    expect(countParams(off)).toBe(218490);
    const { container, unmount } = render(<NetworkDiagram settings={off} />);
    expect(screen.getByText('218,490')).toBeInTheDocument();
    expect(container.querySelectorAll('rect[stroke-dasharray]').length).toBeGreaterThan(0);
    unmount();

    const on = render(<NetworkDiagram settings={settingsWith({ batch_norm: true })} />);
    expect(on.container.querySelectorAll('rect[stroke-dasharray]').length).toBe(0);
  });

  it('dropout 0: no hollow dots drawn; all 16 dots solid', () => {
    const { container } = render(<NetworkDiagram settings={settingsWith({ dropout: 0 })} />);
    expect(container.querySelectorAll('circle').length).toBe(16);
    expect(container.querySelectorAll('circle[stroke-dasharray]').length).toBe(0);
  });

  it('dropout 0.5 with no dense layers: the outputs have no hollow dots (only dense columns get them)', () => {
    const { container } = render(<NetworkDiagram settings={settingsWith({ dropout: 0.5, dense_layers: 0 })} />);
    expect(container.querySelectorAll('circle[stroke-dasharray]').length).toBe(0);
  });

  it('the weight count and size chain follow the form at once, in the phone screen', () => {
    renderConfigure();
    const plusFilters = () => screen.getByRole('group', { name: 'Filters in block 1' });
    fireEvent.click(within(plusFilters()).getByRole('button', { name: '32' }));
    let now = settingsWith({ filters: 32 });
    expect(screen.getByText(formatInt(countParams(now)))).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('2 conv blocks'));

    fireEvent.click(screen.getByRole('button', { name: 'Conv layers per block: more' }));
    now = settingsWith({ filters: 32, conv_layers_per_block: 3 });
    expect(screen.getByText(formatInt(countParams(now)))).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('with 3 conv layers each'));
  });
});

describe('configure screen: order and states', () => {
  it('first run: title, diagram, caption, "No runs yet", Layers, then the start button, in that order', () => {
    renderConfigure();
    const title = screen.getByRole('heading', { name: 'Train' });
    const diagram = screen.getByRole('img');
    const caption = screen.getByText(/Small squares above a block/);
    const none = screen.getByText('No runs yet');
    const layers = screen.getByRole('region', { name: 'Layers' });
    const start = screen.getByRole('button', { name: 'Start training' });
    expect(follows(title, diagram)).toBe(true);
    expect(follows(diagram, caption)).toBe(true);
    expect(follows(caption, none)).toBe(true);
    expect(follows(none, layers)).toBe(true);
    expect(follows(layers, start)).toBe(true);
  });

  it('first run: all thirteen rows show a check marked new, Advanced included', () => {
    const { container } = renderConfigure();
    expect(container.querySelectorAll('[data-status="new"]').length).toBe(13);
    expect(container.textContent).not.toContain('last ');
    expect(screen.queryByRole('button', { name: /Advanced settings/ })).toBeNull();
  });

  it('after a run: the last-run card comes before the settings and no "No runs yet" remains', () => {
    act(() => useTrainingStore.setState({ runs: sampleRuns }));
    const { container } = renderConfigure();
    const link = screen.getByRole('link', { name: /Last run/ });
    expect(screen.queryByText('No runs yet')).toBeNull();
    expect(follows(link, screen.getByRole('region', { name: 'Layers' }))).toBe(true);
    expect(link).toHaveTextContent('98.6% · 138 mistakes · 114 s');
    expect(container.querySelectorAll('[data-status="new"]').length).toBe(0);
    expect(container.textContent).toContain('last ');
  });

  it('after a run: each row has its ideal line, a dashed ideal path, and a run line only where the run has 2 or more values', () => {
    act(() => useTrainingStore.setState({ runs: [runOne] }));
    const { container } = renderConfigure();
    const visible = SETTING_SPECS;
    expect(container.querySelectorAll('[data-setting]').length).toBe(visible.length);
    const checks = evaluateChecks({ run: runOne, prev: null, settings: runOne.settings });
    const withSeries = visible.filter((s) => checks.find((c) => c.key === s.key)!.series.length >= 2).length;
    for (const spec of visible) {
      expect(within(rowOf(container, spec.key)).getByText(/^ideal /)).toBeInTheDocument();
    }
    expect(container.querySelectorAll('path[stroke="var(--color-ideal)"]').length).toBe(visible.length);
    expect(container.querySelectorAll('path[stroke="var(--color-text)"]').length).toBe(withSeries);
  });

  it('the latest run is the one the last-run card shows (not the first)', () => {
    act(() => useTrainingStore.setState({ runs: [runOne, runTwo] }));
    renderConfigure();
    const link = screen.getByRole('link', { name: /Last run/ });
    expect(link).toHaveTextContent('138 mistakes');
    expect(link).not.toHaveTextContent('210 mistakes');
  });

  it('desktop: the Settings pane has no link at all after a run', () => {
    act(() => useTrainingStore.setState({ runs: [runOne] }));
    renderConfigure('desktop');
    const pane = screen.getByRole('region', { name: 'Settings' });
    expect(within(pane).getByText('97.9% · 210 mistakes · 58 s')).toBeInTheDocument();
    expect(within(pane).queryAllByRole('link')).toHaveLength(0);
  });

  it('phone: the back link leads to Recognize and the note sits under Start training', () => {
    renderConfigure();
    expect(screen.getByRole('link', { name: 'Back to Recognize' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Get your own model for recognition.')).toBeInTheDocument();
  });
});

describe('start button in each server and run state', () => {
  function setServer(status: 'unconfigured' | 'idle' | 'ready' | 'starting' | 'unreachable', text: string) {
    act(() => useTrainingStore.setState({ server: { status, text } }));
  }

  it('idle or ready server: enabled, no note', () => {
    for (const status of ['idle', 'ready'] as const) {
      setServer(status, '');
      const { unmount } = renderConfigure();
      expect(screen.getByRole('button', { name: 'Start training' })).toBeEnabled();
      expect(screen.queryByRole('status')).toBeNull();
      unmount();
    }
  });

  it('unconfigured: disabled, and the note is a status message', () => {
    renderConfigure();
    expect(screen.getByRole('button', { name: 'Start training' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(NOT_CONFIGURED_TEXT);
  });

  it('starting: enabled and the note says how long', () => {
    setServer('starting', 'Server is starting, about 1 minute');
    renderConfigure();
    expect(screen.getByRole('button', { name: 'Start training' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('Server is starting, about 1 minute');
  });

  it.each(['waking', 'queued', 'running', 'finishing'] as TrainingPhase[])('phase %s: no start button, a link to the run', (phase) => {
    act(() => useTrainingStore.setState({ phase, server: { status: 'ready', text: '' } }));
    renderConfigure();
    expect(screen.queryByRole('button', { name: 'Start training' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Training, view progress' })).toHaveAttribute('href', '/train/run');
  });

  it.each(['done', 'error', 'stopped', 'idle'] as TrainingPhase[])('phase %s: start is offered again', (phase) => {
    act(() => useTrainingStore.setState({ phase, server: { status: 'ready', text: '' } }));
    renderConfigure();
    expect(screen.getByRole('button', { name: 'Start training' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'Training, view progress' })).toBeNull();
  });

  it('start with changes: the changes go into the form, the run starts with them, and the app opens the run screen', async () => {
    const server = { status: 'ready', statusText: '', url: () => '', wake: async () => {}, whenReady: async () => {}, markAsleep() {} };
    const api = { start: vi.fn((_settings: Settings) => new Promise<never>(() => {})), status: vi.fn(), subscribe: vi.fn(() => () => {}), fileUrl: () => '' };
    configureTraining({ server: server as never, api: api as never });
    expect(val('epochs')).toBe(2);

    render(
      <LayoutModeProvider mode="phone">
        <MemoryRouter initialEntries={['/train']}>
          <Routes>
            <Route
              path="/train"
              element={<StartTrainingButton label="Retrain with Epochs 4" changes={{ epochs: 4 }} />}
            />
            <Route path="/train/run" element={<p>RUN SCREEN</p>} />
          </Routes>
        </MemoryRouter>
      </LayoutModeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retrain with Epochs 4' }));

    expect(val('epochs')).toBe(4);
    expect(screen.getByText('RUN SCREEN')).toBeInTheDocument();
    expect(useTrainingStore.getState().phase).toBe('waking');
    expect(useTrainingStore.getState().jobSettings?.epochs).toBe(4);
    await waitFor(() => expect(api.start).toHaveBeenCalledTimes(1));
    expect(api.start.mock.calls[0][0]).toMatchObject({ epochs: 4 });
  });
});
