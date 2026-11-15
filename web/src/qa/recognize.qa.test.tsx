// QA tests for the Recognize screens. They check what the coders' own tests
// do not: pointer types, edges of the pad, keyboard use, the live result,
// error and empty texts, the tablet and desktop arrangements, and the CSS rules.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LayoutModeProvider } from '../hooks/useLayoutMode';
import { PaneProvider } from '../hooks/usePane';
import { AnswerCard } from '../features/recognize/AnswerCard';
import { DrawingPad } from '../features/recognize/DrawingPad';
import { HowItWasReadCard } from '../features/recognize/HowItWasReadCard';
import { InsideScreen } from '../features/recognize/InsideScreen';
import { MainScreen } from '../features/recognize/MainScreen';
import { ModelPills } from '../features/recognize/ModelPills';
import { ResultCard } from '../features/recognize/ResultCard';
import { describeArchitecture } from '../lib/architecture';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { useDrawingStore } from '../state/drawingStore';
import { runInferenceNow, startInference } from '../state/inferenceStore';
import { useModelStore } from '../state/modelStore';
import { makeFakeModel } from '../test/fixtures';
import { renderApp, resetStores } from '../test/utils';
import type { LayoutMode } from '../types';

const PAD_BOX = {
  left: 0,
  top: 0,
  width: 280,
  height: 280,
  right: 280,
  bottom: 280,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

/** The pad is 280 px wide, so one of its 28 cells is 10 px. */
function padSurface(): HTMLElement {
  const surface = screen.getByTestId('drawing-surface');
  surface.getBoundingClientRect = () => PAD_BOX as unknown as DOMRect;
  return surface;
}

function show(node: React.ReactNode, mode: LayoutMode = 'phone', pane = false) {
  return render(
    <LayoutModeProvider mode={mode}>
      <MemoryRouter>{pane ? <PaneProvider>{node}</PaneProvider> : node}</MemoryRouter>
    </LayoutModeProvider>,
  );
}

function setSaved(status: 'idle' | 'loading' | 'ready' | 'missing' | 'error', extra: { model?: ReturnType<typeof makeFakeModel> | null; error?: string | null } = {}) {
  const model = status === 'ready' ? (extra.model ?? makeFakeModel()) : null;
  useModelStore.setState({ saved: { status, model, error: extra.error ?? null } });
}

function readyModel(options?: Parameters<typeof makeFakeModel>[0]) {
  setSaved('ready', { model: makeFakeModel(options) });
}

/** Reads the drawing with the active model and returns the pixels of the store. */
function pixelsNow(): Float32Array {
  return useDrawingStore.getState().pixels;
}

/** Reads every recognize stylesheet as text. */
function recognizeCss(): Record<string, string> {
  // Vitest runs from web/, so the folder is found from the working directory.
  const dir = join(process.cwd(), 'src/features/recognize');
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.css')) out[name] = readFileSync(join(dir, name), 'utf8');
  }
  return out;
}

beforeEach(() => resetStores());

describe('DrawingPad pointers', () => {
  it('paints with a touch', () => {
    show(<DrawingPad />);
    const surface = padSurface();
    fireEvent.pointerDown(surface, { clientX: 50, clientY: 50, pointerId: 7, button: 0, pointerType: 'touch' });
    fireEvent.pointerUp(surface, { pointerId: 7, pointerType: 'touch' });
    expect(useDrawingStore.getState().blank).toBe(false);
    expect(pixelsNow()[5 * 28 + 5]).toBe(1);
  });

  it('paints with a pen', () => {
    show(<DrawingPad />);
    const surface = padSurface();
    fireEvent.pointerDown(surface, { clientX: 50, clientY: 50, pointerId: 3, button: 0, pointerType: 'pen' });
    fireEvent.pointerMove(surface, { clientX: 200, clientY: 50, pointerId: 3, pointerType: 'pen' });
    fireEvent.pointerUp(surface, { pointerId: 3, pointerType: 'pen' });
    expect(useDrawingStore.getState().blank).toBe(false);
    // The stroke runs along row 5 from column 5 to column 20.
    expect(pixelsNow()[5 * 28 + 12]).toBe(1);
  });

  it('ignores the right mouse button', () => {
    show(<DrawingPad />);
    const surface = padSurface();
    fireEvent.pointerDown(surface, { clientX: 50, clientY: 50, pointerId: 1, button: 2, pointerType: 'mouse' });
    fireEvent.pointerMove(surface, { clientX: 150, clientY: 150, pointerId: 1, pointerType: 'mouse' });
    expect(useDrawingStore.getState().blank).toBe(true);
  });

  it('keeps ink inside the grid and reaches the edge when the pointer leaves the pad to the right', () => {
    show(<DrawingPad />);
    const surface = padSurface();
    fireEvent.pointerDown(surface, { clientX: 140, clientY: 140, pointerId: 1, button: 0, pointerType: 'mouse' });
    fireEvent.pointerMove(surface, { clientX: 900, clientY: 140, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: 'mouse' });
    const pixels = pixelsNow();
    expect(pixels).toHaveLength(784);
    expect(Array.from(pixels).every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
    // Row 14, last column: the stroke was clamped to the right edge.
    expect(pixels[14 * 28 + 27]).toBeGreaterThan(0);
  });

  it('does not draw a line across the pad when a second finger touches down', () => {
    show(<DrawingPad />);
    const surface = padSurface();
    fireEvent.pointerDown(surface, { clientX: 40, clientY: 40, pointerId: 1, button: 0, pointerType: 'touch' });
    fireEvent.pointerDown(surface, { clientX: 240, clientY: 240, pointerId: 2, button: 0, pointerType: 'touch' });
    // Only the first finger moves. The line from the second finger's spot to here is not a stroke of the drawing.
    fireEvent.pointerMove(surface, { clientX: 60, clientY: 40, pointerId: 1, pointerType: 'touch' });
    // Cell (15, 14) lies on the line from (24, 24) to (6, 4), which a second finger would make.
    expect(pixelsNow()[14 * 28 + 15]).toBe(0);
  });

  it('clears with the keyboard on the Clear drawing button', async () => {
    const user = userEvent.setup();
    show(<DrawingPad />);
    const surface = padSurface();
    fireEvent.pointerDown(surface, { clientX: 50, clientY: 50, pointerId: 1, button: 0, pointerType: 'mouse' });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: 'mouse' });
    expect(useDrawingStore.getState().blank).toBe(false);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Clear drawing' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(useDrawingStore.getState().blank).toBe(true);
  });

  it('has the pad label that matches the state', () => {
    show(<DrawingPad />);
    expect(screen.getByRole('img', { name: 'Drawing pad, 28 by 28 cells, empty' })).toBeInTheDocument();
    const surface = padSurface();
    fireEvent.pointerDown(surface, { clientX: 50, clientY: 50, pointerId: 1, button: 0, pointerType: 'mouse' });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: 'mouse' });
    expect(screen.getByRole('img', { name: 'Drawing pad, 28 by 28 cells, with your drawing' })).toBeInTheDocument();
  });
});

describe('DrawingPad CSS rules', () => {
  it('keeps the pad square and stops touch from scrolling it', () => {
    const css = recognizeCss()['DrawingPad.module.css'];
    expect(css).toMatch(/aspect-ratio:\s*1\b/);
    expect(css).toMatch(/touch-action:\s*none/);
  });
});

describe('live result', () => {
  let stop: (() => void) | undefined;
  afterEach(() => {
    stop?.();
    stop = undefined;
  });

  it('shows the digit as the visitor draws and goes back to the empty state on clear', async () => {
    readyModel({ digit: 7, confidence: 0.9 });
    stop = startInference();
    show(
      <>
        <DrawingPad />
        <ResultCard variant="bars" />
      </>,
    );
    const surface = padSurface();
    fireEvent.pointerDown(surface, { clientX: 50, clientY: 50, pointerId: 1, button: 0, pointerType: 'mouse' });
    fireEvent.pointerMove(surface, { clientX: 150, clientY: 150, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: 'mouse' });
    await waitFor(() => expect(screen.getByText('90.0%')).toBeInTheDocument());
    expect(screen.getByRole('img', { name: /7 is highest at 90\.0%/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear drawing' }));
    await waitFor(() => expect(screen.getByText('Draw a digit')).toBeInTheDocument());
    expect(screen.getByText('–')).toBeInTheDocument();
  });
});

describe('ModelPills keyboard and state', () => {
  it('groups the pills under the name Model', () => {
    show(<ModelPills />);
    expect(screen.getByRole('group', { name: 'Model' })).toBeInTheDocument();
  });

  it('switches to My trained with the keyboard once it is ready', async () => {
    const user = userEvent.setup();
    useModelStore.getState().setRetrained(makeFakeModel(), 'run-9');
    show(<ModelPills />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'App model' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'My trained' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(useModelStore.getState().active).toBe('retrained');
    expect(screen.getByRole('button', { name: 'My trained' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'App model' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('skips the disabled My trained pill when tabbing', async () => {
    const user = userEvent.setup();
    show(<ModelPills />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'App model' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'My trained' })).not.toHaveFocus();
  });
});

describe('ResultCard states and variants', () => {
  it('wide variant with a reading: heading, sentence, digit and percentage, and no bars', () => {
    readyModel({ digit: 3, confidence: 0.962 });
    act(() => useDrawingStore.getState().stroke({ x: 5, y: 5 }, { x: 20, y: 20 }));
    runInferenceNow();
    show(<ResultCard variant="wide" />);
    const card = screen.getByRole('region', { name: 'Result' });
    expect(within(card).getByRole('heading', { name: 'Result' })).toBeInTheDocument();
    expect(within(card).getByText('Most likely digit and how sure the network is.')).toBeInTheDocument();
    expect(within(card).getByText('3')).toBeInTheDocument();
    expect(within(card).getByText('96.2%')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Probability for each digit/ })).not.toBeInTheDocument();
  });

  it('wide variant on a blank pad: dash and the draw sentence', () => {
    readyModel();
    runInferenceNow();
    show(<ResultCard variant="wide" />);
    expect(screen.getByText('–')).toBeInTheDocument();
    expect(screen.getByText('Draw a digit on the pad to see it read.')).toBeInTheDocument();
  });

  it('shows the default error sentence when the store has no message', () => {
    setSaved('error', { error: null });
    show(<ResultCard variant="wide" />);
    expect(screen.getByText('Model not loaded')).toBeInTheDocument();
    expect(screen.getByText('The model could not be loaded, so there is nothing to show.')).toBeInTheDocument();
  });

  it('titles the missing state "Model missing"', () => {
    setSaved('missing');
    show(<ResultCard variant="bars" />);
    expect(screen.getByText('Model missing')).toBeInTheDocument();
  });

  it('shows Loading for the wide variant while the model loads', () => {
    setSaved('loading');
    show(<ResultCard variant="wide" />);
    expect(screen.getByText('Loading')).toBeInTheDocument();
    expect(screen.getByText('The model is loading.')).toBeInTheDocument();
  });

  it('reads with the retrained model once it is active', () => {
    useModelStore.getState().setRetrained(makeFakeModel({ digit: 4, confidence: 0.8 }), 'run-2');
    useModelStore.getState().setActive('retrained');
    act(() => useDrawingStore.getState().stroke({ x: 5, y: 5 }, { x: 20, y: 20 }));
    runInferenceNow();
    show(<ResultCard variant="bars" />);
    expect(screen.getByRole('img', { name: /4 is highest at 80\.0%/ })).toBeInTheDocument();
  });
});

describe('Recognize in a pane and on tablet or desktop', () => {
  it('InsideScreen in a pane has no back link', () => {
    readyModel();
    show(<InsideScreen />, 'desktop', true);
    expect(screen.queryByRole('link', { name: 'Back to drawing' })).not.toBeInTheDocument();
    expect(screen.getByText('01 Input')).toBeInTheDocument();
  });

  it('InsideScreen on the phone links back to the drawing', () => {
    readyModel();
    show(<InsideScreen />);
    expect(screen.getByRole('link', { name: 'Back to drawing' })).toHaveAttribute('href', '/');
  });

  it('MainScreen has no Mode tab bar, on the phone or in a pane', () => {
    const { unmount } = show(<MainScreen />, 'phone');
    expect(screen.queryByRole('navigation', { name: 'Mode' })).not.toBeInTheDocument();
    unmount();
    show(<MainScreen />, 'phone', true);
    expect(screen.queryByRole('navigation', { name: 'Mode' })).not.toBeInTheDocument();
  });

  it('MainScreen shows no How it was read link in a pane even with a model drawn', () => {
    readyModel();
    show(<MainScreen />, 'desktop', true);
    expect(screen.queryByRole('link', { name: /How it was read/ })).not.toBeInTheDocument();
  });

  it('the phone recognize screen shows the conv blocks under the result, and the Train button', () => {
    readyModel();
    renderApp({ route: '/', mode: 'phone' });
    expect(screen.queryByRole('link', { name: /How it was read/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How it was read' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Conv block 1' })).toHaveTextContent('01 Conv block 1');
    expect(screen.getByRole('region', { name: 'Conv block 2' })).toHaveTextContent('02 Conv block 2');
    expect(screen.queryByText('01 Input')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Train' })).toHaveAttribute('href', '/train');
    expect(screen.queryByRole('navigation', { name: 'Mode' })).not.toBeInTheDocument();
  });

  it('the tablet recognize page has three cards and no How it was read link', () => {
    readyModel();
    renderApp({ route: '/', mode: 'tablet' });
    expect(screen.queryByRole('link', { name: /How it was read/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear drawing' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Result' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Answer' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How it was read' })).toBeInTheDocument();
  });

  it('the desktop recognize page shows both panes and no back or How it was read link', () => {
    readyModel();
    renderApp({ route: '/', mode: 'desktop' });
    expect(screen.queryByRole('link', { name: 'Back to drawing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /How it was read/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear drawing' })).toBeInTheDocument();
    expect(screen.getByText('01 Input')).toBeInTheDocument();
  });

  it('the How it was read address redirects to the drawing on tablet', async () => {
    readyModel();
    renderApp({ route: '/inside', mode: 'tablet' });
    expect(await screen.findByRole('region', { name: 'Result' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back to drawing' })).not.toBeInTheDocument();
  });
});

describe('How it was read blocks and answer', () => {
  it('a block with fewer filters than 8 shows All N maps', () => {
    const base = makeFakeModel();
    const small = { ...base.info.blocks[0], filters: 4 };
    readyModel({ info: { ...base.info, blocks: [small, base.info.blocks[1]] } });
    act(() => useDrawingStore.getState().stroke({ x: 5, y: 5 }, { x: 20, y: 20 }));
    runInferenceNow();
    show(<InsideScreen />);
    expect(screen.getByText(/All 4 maps, each 14 × 14\./)).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Feature map, 14 by 14' })).toHaveLength(4);
  });

  it('tablet card follows a 3-block model with 03 Conv block 3', () => {
    const base = makeFakeModel();
    const third = { index: 3, filters: 64, convLayers: 1, kernel: 3, inSize: 7, outSize: 3 };
    readyModel({ info: { ...base.info, blocks: [...base.info.blocks, third] } });
    show(<HowItWasReadCard />, 'tablet');
    expect(screen.getByText('03 Conv block 3')).toBeInTheDocument();
    expect(screen.getByText('1 × conv 3×3 · pool · 7 → 3')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Feature map, 3 by 3' })).toHaveLength(8);
  });

  it('tablet card follows a 1-block model with only block 1', () => {
    const base = makeFakeModel();
    readyModel({ info: { ...base.info, blocks: [base.info.blocks[0]], flatten: 3136 } });
    show(<HowItWasReadCard />, 'tablet');
    expect(screen.getByText('01 Conv block 1')).toBeInTheDocument();
    expect(screen.queryByText(/Conv block 2/)).not.toBeInTheDocument();
  });

  it('tablet card on a blank pad shows the draw prompt in each block and empty maps', () => {
    readyModel();
    show(<HowItWasReadCard />, 'tablet');
    expect(screen.getAllByText(/Draw a digit to see it here\./)).toHaveLength(2);
    expect(screen.getAllByRole('img', { name: 'Feature map, 14 by 14' })).toHaveLength(8);
  });

  it('answer card on a blank pad shows dashes and the draw note', () => {
    readyModel();
    show(<AnswerCard />, 'tablet');
    expect(screen.getAllByText('–')).toHaveLength(10);
    expect(screen.getByText('Draw a digit to see the probabilities.')).toBeInTheDocument();
  });

  it('answer card with a missing model shows No model and no spec line', () => {
    setSaved('missing');
    show(<AnswerCard />, 'tablet');
    expect(screen.getByText('No model')).toBeInTheDocument();
    expect(screen.getByText(/not added yet/)).toBeInTheDocument();
    expect(screen.queryByText(/dense 128/)).not.toBeInTheDocument();
  });

  it('inside screen with a model that is still loading shows the loading sentence and no answer bars', () => {
    setSaved('loading');
    show(<InsideScreen />);
    expect(screen.getByText('The model is loading.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /nothing to read yet/ })).toBeInTheDocument();
  });

  it('answer spec uses the default architecture numbers', () => {
    const arch = describeArchitecture(DEFAULT_SETTINGS);
    expect(arch.flatten).toBe(1568);
    readyModel();
    show(<AnswerCard />, 'tablet');
    expect(screen.getByText('1,568 → dense 128 → 10')).toBeInTheDocument();
  });
});
