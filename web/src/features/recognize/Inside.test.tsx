import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { LayoutModeProvider } from '../../hooks/useLayoutMode';
import { runInferenceNow } from '../../state/inferenceStore';
import { useDrawingStore } from '../../state/drawingStore';
import { useModelStore } from '../../state/modelStore';
import { makeFakeModel } from '../../test/fixtures';
import { resetStores } from '../../test/utils';
import { AnswerCard } from './AnswerCard';
import { HowItWasReadCard } from './HowItWasReadCard';
import { InsideScreen } from './InsideScreen';

function show(ui: React.ReactElement, mode: 'phone' | 'tablet' = 'phone') {
  return render(
    <LayoutModeProvider mode={mode}>
      <MemoryRouter>{ui}</MemoryRouter>
    </LayoutModeProvider>,
  );
}

function ready(model = makeFakeModel(), drawn = true) {
  useModelStore.setState({ saved: { status: 'ready', model, error: null } });
  if (drawn) useDrawingStore.getState().stroke({ x: 5, y: 5 }, { x: 20, y: 20 });
  runInferenceNow();
}

beforeEach(() => resetStores());

describe('InsideScreen', () => {
  it('numbers the steps and shows both default blocks and the answer', () => {
    ready();
    show(<InsideScreen />);
    expect(screen.getByText('01 Input')).toBeInTheDocument();
    expect(screen.getByText('02 Conv block 1')).toBeInTheDocument();
    expect(screen.getByText('03 Conv block 2')).toBeInTheDocument();
    expect(screen.getByText('04 Answer')).toBeInTheDocument();
    expect(screen.getByText('2 × conv 3×3 · pool · 28 → 14')).toBeInTheDocument();
    expect(screen.getByText('16 filters find strokes and edges')).toBeInTheDocument();
    expect(screen.getByText(/8 of 16 maps, each 14 × 14/)).toBeInTheDocument();
    expect(screen.getByText('1,568 → dense 128 → 10')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Feature map, 14 by 14' })).toHaveLength(8);
    expect(screen.getAllByRole('img', { name: 'Feature map, 7 by 7' })).toHaveLength(8);
  });

  it('has a back link and ten bars with the top digit named', () => {
    ready(makeFakeModel({ digit: 3, confidence: 0.962 }));
    show(<InsideScreen />);
    expect(screen.getByRole('link', { name: 'Back to drawing' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /3 is highest at 96\.2 percent/ })).toBeInTheDocument();
    expect(screen.getByText('96.2%')).toBeInTheDocument();
    expect(screen.getAllByText('0.4%')).toHaveLength(9);
  });

  it('writes "<0.1%" for tiny values', () => {
    ready(makeFakeModel({ digit: 1, confidence: 0.9995 }));
    show(<InsideScreen />);
    expect(screen.getAllByText('<0.1%')).toHaveLength(9);
  });

  it('follows a model with one block', () => {
    const base = makeFakeModel();
    ready(makeFakeModel({ info: { ...base.info, blocks: [base.info.blocks[0]], flatten: 3136 } }));
    show(<InsideScreen />);
    expect(screen.queryByText(/Conv block 2/)).not.toBeInTheDocument();
    expect(screen.getByText('03 Answer')).toBeInTheDocument();
    expect(screen.getByText('3,136 → dense 128 → 10')).toBeInTheDocument();
  });

  it('follows a model with three blocks', () => {
    const base = makeFakeModel();
    const third = { index: 3, filters: 64, convLayers: 1, kernel: 3, inSize: 7, outSize: 3 };
    ready(makeFakeModel({ info: { ...base.info, blocks: [...base.info.blocks, third] } }));
    show(<InsideScreen />);
    expect(screen.getByText('04 Conv block 3')).toBeInTheDocument();
    expect(screen.getByText('64 filters find parts of digits')).toBeInTheDocument();
    expect(screen.getByText('1 × conv 3×3 · pool · 7 → 3')).toBeInTheDocument();
    expect(screen.getByText('05 Answer')).toBeInTheDocument();
  });

  it('shows empty maps and bars with a sentence on a blank pad', () => {
    ready(makeFakeModel(), false);
    show(<InsideScreen />);
    expect(screen.getAllByRole('img', { name: 'Feature map, 14 by 14' })).toHaveLength(8);
    expect(screen.getByRole('img', { name: /nothing to read yet/ })).toBeInTheDocument();
    expect(screen.getByText('Draw a digit to see the probabilities.')).toBeInTheDocument();
    expect(screen.getAllByText('–')).toHaveLength(10);
  });

  it.each([
    ['missing', /not added yet/],
    ['loading', /loading/],
    ['error', /could not be loaded/],
  ] as const)('says why when the model is %s', (status, text) => {
    useModelStore.setState({ saved: { status, model: null, error: null } });
    runInferenceNow();
    show(<InsideScreen />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText(/Conv block/)).not.toBeInTheDocument();
    expect(screen.getByText('01 Input')).toBeInTheDocument();
  });
});

describe('tablet cards', () => {
  it('HowItWasReadCard starts at 01 Conv block 1 and has no input', () => {
    ready();
    show(<HowItWasReadCard />, 'tablet');
    expect(screen.getByRole('heading', { name: 'How it was read' })).toBeInTheDocument();
    expect(screen.getByText('01 Conv block 1')).toBeInTheDocument();
    expect(screen.getByText('02 Conv block 2')).toBeInTheDocument();
    expect(screen.queryByText('01 Input')).not.toBeInTheDocument();
    expect(screen.getByText(/^8 of 16 maps\./)).toBeInTheDocument();
  });

  it('HowItWasReadCard shows an empty state with no model', () => {
    show(<HowItWasReadCard />, 'tablet');
    expect(screen.getByText('No model')).toBeInTheDocument();
  });

  it('AnswerCard shows spec, bars and the digit', () => {
    ready(makeFakeModel({ digit: 7, confidence: 0.9 }));
    show(<AnswerCard className="x" />, 'tablet');
    const card = screen.getByRole('region', { name: 'Answer' });
    expect(within(card).getByText('1,568 → dense 128 → 10')).toBeInTheDocument();
    expect(within(card).getByText('10 probabilities that add up to 100%.')).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: /7 is highest at 90\.0 percent/ })).toBeInTheDocument();
  });
});
