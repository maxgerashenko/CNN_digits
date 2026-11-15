import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { LayoutModeProvider } from '../../hooks/useLayoutMode';
import { PaneProvider } from '../../hooks/usePane';
import { useDrawingStore } from '../../state/drawingStore';
import { runInferenceNow } from '../../state/inferenceStore';
import { useModelStore } from '../../state/modelStore';
import { makeFakeModel } from '../../test/fixtures';
import { resetStores } from '../../test/utils';
import { DrawingPad } from './DrawingPad';
import { MainScreen } from './MainScreen';
import { ModelPills } from './ModelPills';
import { ResultCard } from './ResultCard';

function ui(node: React.ReactNode, pane = false) {
  return render(
    <LayoutModeProvider mode="phone">
      <MemoryRouter>{pane ? <PaneProvider>{node}</PaneProvider> : node}</MemoryRouter>
    </LayoutModeProvider>,
  );
}

function readyModel() {
  useModelStore.setState({ saved: { status: 'ready', model: makeFakeModel(), error: null } });
}

beforeEach(() => resetStores());

describe('DrawingPad', () => {
  it('paints through the store on pointer events and clears', () => {
    ui(<DrawingPad />);
    const surface = screen.getByTestId('drawing-surface');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 280, height: 280, right: 280, bottom: 280, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 150, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(surface, { pointerId: 1 });
    expect(useDrawingStore.getState().blank).toBe(false);
    expect(Array.from(useDrawingStore.getState().pixels).some((v) => v > 0)).toBe(true);
    // After release, moving does not paint more.
    const before = useDrawingStore.getState().pixels;
    fireEvent.pointerMove(surface, { clientX: 200, clientY: 200, pointerId: 1 });
    expect(useDrawingStore.getState().pixels).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'Clear drawing' }));
    expect(useDrawingStore.getState().blank).toBe(true);
    expect(screen.getByText('28 × 28')).toBeInTheDocument();
  });
});

describe('ModelPills', () => {
  it('disables My retrained until one exists, then switches', () => {
    ui(<ModelPills />);
    expect(screen.getByRole('button', { name: 'My retrained' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saved model' })).toHaveAttribute('aria-pressed', 'true');
    act(() => useModelStore.getState().setRetrained(makeFakeModel(), 'run-1'));
    fireEvent.click(screen.getByRole('button', { name: 'My retrained' }));
    expect(useModelStore.getState().active).toBe('retrained');
    expect(screen.getByRole('button', { name: 'My retrained' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('ResultCard', () => {
  it('says the saved model is missing', () => {
    useModelStore.setState({ saved: { status: 'missing', model: null, error: null } });
    ui(<ResultCard variant="bars" />);
    expect(screen.getByText(/saved model is not added yet/i)).toBeInTheDocument();
  });

  it('shows the error sentence', () => {
    useModelStore.setState({ saved: { status: 'error', model: null, error: 'Broken weights file.' } });
    ui(<ResultCard variant="wide" />);
    expect(screen.getByText('Broken weights file.')).toBeInTheDocument();
  });

  it('shows loading', () => {
    useModelStore.setState({ saved: { status: 'loading', model: null, error: null } });
    ui(<ResultCard variant="bars" />);
    expect(screen.getByText('The model is loading.')).toBeInTheDocument();
  });

  it('shows no digit on a blank pad', () => {
    readyModel();
    runInferenceNow();
    ui(<ResultCard variant="bars" />);
    expect(screen.getByText('–')).toBeInTheDocument();
    expect(screen.getByText('Draw a digit')).toBeInTheDocument();
  });

  it.each(['bars', 'wide'] as const)('shows the digit and percentage (%s)', (variant) => {
    readyModel();
    act(() => useDrawingStore.getState().stroke({ x: 5, y: 5 }, { x: 20, y: 20 }));
    runInferenceNow();
    ui(<ResultCard variant={variant} />);
    expect(screen.getByText(/^\d+(\.\d)?%$|^<0\.1%$/)).toBeInTheDocument();
    if (variant === 'bars') expect(screen.getByRole('img', { name: /Probability for each digit 0 to 9; \d is highest/ })).toBeInTheDocument();
  });
});

describe('MainScreen', () => {
  it('links to How it was read on the phone, not in a pane', () => {
    const { unmount } = ui(<MainScreen />);
    expect(screen.getByRole('link', { name: /How it was read/ })).toHaveAttribute('href', '/inside');
    unmount();
    ui(<MainScreen />, true);
    expect(screen.queryByRole('link', { name: /How it was read/ })).toBeNull();
  });
});
