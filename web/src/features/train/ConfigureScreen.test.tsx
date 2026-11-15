import { act, screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { LayoutModeProvider } from '../../hooks/useLayoutMode';
import { PaneProvider } from '../../hooks/usePane';
import { NOT_CONFIGURED_TEXT, useTrainingStore } from '../../state/trainingStore';
import { runOne } from '../../test/fixtures';
import { renderApp, resetStores } from '../../test/utils';
import { LastRunCard } from './LastRunCard';
import { StartTrainingButton } from './StartTrainingButton';

beforeEach(() => resetStores());

describe('ConfigureScreen', () => {
  it('first run: No runs yet card, no details link, disabled start with the note', () => {
    renderApp({ route: '/train' });
    expect(screen.getByRole('heading', { name: 'Train' })).toBeInTheDocument();
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Last run/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start training' })).toBeDisabled();
    expect(screen.getByText(NOT_CONFIGURED_TEXT)).toBeInTheDocument();
    expect(screen.getByText(/Small squares above a block/)).toBeInTheDocument();
  });

  it('after a run: last-run card describes the run and links to Details', () => {
    act(() => useTrainingStore.setState({ runs: [runOne] }));
    renderApp({ route: '/train' });
    const link = screen.getByRole('link', { name: /Last run/ });
    expect(link).toHaveAttribute('href', '/train/details');
    expect(link).toHaveTextContent('97.9% · 210 mistakes · 58 s');
    expect(screen.queryByText('No runs yet')).toBeNull();
  });
});

describe('LastRunCard in a pane', () => {
  it('has no link', () => {
    act(() => useTrainingStore.setState({ runs: [runOne] }));
    render(
      <LayoutModeProvider mode="desktop">
        <MemoryRouter>
          <PaneProvider>
            <LastRunCard />
          </PaneProvider>
        </MemoryRouter>
      </LayoutModeProvider>,
    );
    expect(screen.getByText('97.9% · 210 mistakes · 58 s')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('StartTrainingButton', () => {
  function setup() {
    render(
      <LayoutModeProvider mode="phone">
        <MemoryRouter>
          <StartTrainingButton />
        </MemoryRouter>
      </LayoutModeProvider>,
    );
  }

  it('shows the starting note and stays enabled', () => {
    act(() => useTrainingStore.setState({ server: { status: 'starting', text: 'Server is starting, about 1 minute' } }));
    setup();
    expect(screen.getByText('Server is starting, about 1 minute')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start training' })).toBeEnabled();
  });

  it('shows the unreachable note', () => {
    act(() => useTrainingStore.setState({ server: { status: 'unreachable', text: 'cannot be reached' } }));
    setup();
    expect(screen.getByText('cannot be reached')).toBeInTheDocument();
  });

  it('reads "Training, view progress" and links to the run while busy', () => {
    act(() => useTrainingStore.setState({ phase: 'running', server: { status: 'ready', text: '' } }));
    setup();
    expect(screen.getByRole('link', { name: 'Training, view progress' })).toHaveAttribute('href', '/train/run');
  });
});
