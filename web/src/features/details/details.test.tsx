import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSettingsStore } from '../../state/settingsStore';
import { useTrainingStore } from '../../state/trainingStore';
import { renderApp, resetStores } from '../../test/utils';
import { runOne, runTwo, settingsWith } from '../../test/fixtures';
import { RunSummaryTable } from './RunSummaryTable';
import type { RunRecord } from '../../types';

function setRuns(runs: RunRecord[]) {
  useTrainingStore.setState({ runs });
}

beforeEach(() => resetStores());

describe('DetailsScreen', () => {
  it('shows one empty state and no table without runs', () => {
    renderApp({ route: '/train/details' });
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows run numbers, one changed setting and the lists for two runs', () => {
    setRuns([runOne, runTwo]);
    renderApp({ route: '/train/details' });
    const table = screen.getByRole('table', { name: 'Run summary' });
    expect(within(table).getByText('run 1')).toBeInTheDocument();
    expect(within(table).getByText('run 2')).toBeInTheDocument();
    expect(within(table).getByText('Val accuracy')).toBeInTheDocument();
    expect(screen.getByText('Changed since run 1')).toBeInTheDocument();
    expect(screen.getByText(/Only one setting changed/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Raw charts/ })).toBeNull();
    expect(screen.getByText('Keep')).toBeInTheDocument();
  });

  it('says several settings changed', () => {
    setRuns([runOne, { ...runTwo, settings: settingsWith({ epochs: 4, dropout: 0.3 }) }]);
    renderApp({ route: '/train/details' });
    expect(screen.getByText(/Several settings changed/)).toBeInTheDocument();
  });

  it('says no setting changed', () => {
    setRuns([runOne, { ...runTwo, settings: runOne.settings }]);
    renderApp({ route: '/train/details' });
    expect(screen.getByText('No setting changed')).toBeInTheDocument();
  });

  it('puts a dash in the first column with one run and leaves out the changed card', () => {
    setRuns([runOne]);
    renderApp({ route: '/train/details' });
    const table = screen.getByRole('table', { name: 'Run summary' });
    expect(within(table).getAllByText('–')).toHaveLength(3);
    expect(screen.queryByText(/Changed since/)).toBeNull();
  });

  it('retrains with the first change-first setting', async () => {
    setRuns([runOne]);
    useTrainingStore.setState({ server: { status: 'ready', text: '' } });
    renderApp({ route: '/train/details' });
    // On the phone the button puts the change into the form and opens the settings.
    const button = screen.getByRole('link', { name: /^Retrain with / });
    expect(button).toHaveTextContent('Retrain with Epochs 4');
    expect(screen.getByText('Change one setting per run to see its effect.')).toBeInTheDocument();
    await userEvent.click(button);
    expect(useSettingsStore.getState().settings.epochs).toBe(4);
    expect(useTrainingStore.getState().phase).toBe('idle');
    expect(screen.getByRole('heading', { level: 1, name: 'Train' })).toBeInTheDocument();
  });

  it('hides Raw charts link in a pane', () => {
    setRuns([runOne]);
    renderApp({ route: '/train', mode: 'desktop' });
    expect(screen.queryByRole('link', { name: /Raw charts/ })).toBeNull();
  });
});

describe('RunSummaryTable compact', () => {
  it('renders the table with a compact prop and nothing before a run', () => {
    const { container, unmount } = render(
      <MemoryRouter>
        <RunSummaryTable compact />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
    unmount();
    setRuns([runOne, runTwo]);
    render(
      <MemoryRouter>
        <RunSummaryTable compact />
      </MemoryRouter>,
    );
    expect(screen.getByRole('table', { name: 'Run summary' })).toBeInTheDocument();
  });
});
