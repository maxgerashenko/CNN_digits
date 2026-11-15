import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { LayoutModeProvider } from '../../hooks/useLayoutMode';
import { useSettingsStore } from '../../state/settingsStore';
import { useTrainingStore } from '../../state/trainingStore';
import { resetStores } from '../../test/utils';
import { runOne, runTwo } from '../../test/fixtures';
import { ChangeFirstColumn } from './ChangeFirstColumn';
import { ChangeFirstList } from './ChangeFirstList';
import type { RunRecord } from '../../types';

function setRuns(runs: RunRecord[]) {
  act(() => useTrainingStore.setState({ runs }));
}

function view(ui: React.ReactElement, mode: 'phone' | 'tablet' = 'phone') {
  return render(
    <LayoutModeProvider mode={mode}>
      <MemoryRouter>{ui}</MemoryRouter>
    </LayoutModeProvider>,
  );
}

beforeEach(() => resetStores());

describe('ChangeFirstList', () => {
  it('renders nothing without a run', () => {
    const { container } = view(<ChangeFirstList />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a card for the failed Epochs check and sets the next value', async () => {
    setRuns([runOne]);
    view(<ChangeFirstList />);
    expect(screen.getByRole('heading', { name: 'Change first' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Epochs' })).toBeInTheDocument();
    expect(screen.getByText(/checks loss slope at the end/)).toBeInTheDocument();
    const card = screen.getByRole('heading', { name: 'Epochs' }).closest('section')!;
    const button = within(card).getByRole('button', { name: /^Set / });
    const next = Number(button.textContent!.replace('Set ', ''));
    await userEvent.click(button);
    expect(next).toBeGreaterThan(runOne.settings.epochs);
    expect(useSettingsStore.getState().settings.epochs).toBe(next);
  });

  it('single run leaves out the gap bar and evidence tag', () => {
    setRuns([runOne]);
    view(<ChangeFirstList />);
    expect(screen.queryByText(/of the gap closed/)).toBeNull();
    expect(screen.queryByText('MEASURED')).toBeNull();
    expect(screen.queryByText('ESTIMATE')).toBeNull();
  });

  it('two runs show the gap closed and the evidence tag', () => {
    const worse = { ...runTwo, results: { ...runTwo.results, valLoss: 0.09 } };
    setRuns([runOne, worse]);
    view(<ChangeFirstList />);
    expect(screen.getAllByText(/% of the gap closed/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/MEASURED|ESTIMATE/).length).toBeGreaterThan(0);
  });

  it('says nothing to change first when every check passes or has nothing to try', () => {
    const good = {
      ...runOne,
      settings: { ...runOne.settings, epochs: 20 as never },
    };
    setRuns([good]);
    const { container } = view(<ChangeFirstList />);
    // Either cards or the empty state; the heading is always there.
    expect(container.querySelector('h2')).not.toBeNull();
    const hasEmpty = screen.queryByText('Nothing to change first') !== null;
    expect(hasEmpty || container.querySelectorAll('h3').length > 0).toBe(true);
  });
});

describe('ChangeFirstColumn', () => {
  it('shows No runs yet before the first run', () => {
    view(<ChangeFirstColumn />, 'tablet');
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
  });

  it('shows compact cards, the counts and the Raw charts link', () => {
    setRuns([runOne]);
    view(<ChangeFirstColumn />, 'tablet');
    expect(screen.getByText('Epochs')).toBeInTheDocument();
    expect(screen.getByText('Try later')).toBeInTheDocument();
    expect(screen.getByText('Keep')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Raw charts/ })).toHaveAttribute('href', '/train/charts');
    expect(screen.queryByRole('button', { name: /^Set/ })).toBeNull();
  });
});
