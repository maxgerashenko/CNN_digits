import { act, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { LayoutModeProvider } from '../../hooks/useLayoutMode';
import { renderApp, resetStores } from '../../test/utils';
import { useTrainingStore } from '../../state/trainingStore';
import { runOne } from '../../test/fixtures';
import type { LayoutMode } from '../../types';
import { AppShell } from './AppShell';
import { Pane, Panes } from './Panes';
import { Screen } from './Screen';

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

beforeEach(() => resetStores());

describe('tab bar', () => {
  it('shows on root screens in phone mode', () => {
    renderApp({ route: '/', mode: 'phone' });
    expect(screen.getByRole('navigation', { name: 'Mode' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recognize' })).toHaveAttribute('aria-current', 'page');
  });

  it('marks Train for every /train address', () => {
    renderApp({ route: '/train', mode: 'phone' });
    expect(screen.getByRole('link', { name: 'Train' })).toHaveAttribute('aria-current', 'page');
  });

  it('is absent on pushed screens, with a back link to the parent', () => {
    renderApp({ route: '/inside', mode: 'phone' });
    expect(screen.queryByRole('navigation', { name: 'Mode' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to drawing' })).toHaveAttribute('href', '/');
  });

  it('is absent on pushed screens: details goes back to Train', () => {
    renderApp({ route: '/train/details', mode: 'phone' });
    expect(screen.getByRole('link', { name: 'Back to settings' })).toHaveAttribute('href', '/train');
  });
});

describe('rail', () => {
  it('shows only in desktop mode', () => {
    for (const mode of ['phone', 'tablet'] as LayoutMode[]) {
      const { unmount } = renderApp({ route: '/', mode });
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
      unmount();
    }
    renderApp({ route: '/', mode: 'desktop' });
    expect(within(screen.getByRole('complementary')).getByText('Saved model')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Mode' })).toBeInTheDocument();
  });
});

describe('tablet', () => {
  it('has the header with the tab switch, not the phone tab bar', () => {
    renderApp({ route: '/train', mode: 'tablet' });
    expect(screen.getByRole('heading', { level: 1, name: 'Train' })).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Mode' })).toHaveLength(1);
  });
});

describe('Pane', () => {
  it('has no back button and no tab bar inside', () => {
    render(
      <LayoutModeProvider mode="phone">
        <MemoryRouter>
          <Panes>
            <Pane label="Details">
              <Screen title="Run details" variant="pushed" backTo="/train" backLabel="Back">
                <p>body</p>
              </Screen>
            </Pane>
            <Pane label="Main">
              <Screen title="Recognize" variant="root">
                <p>main</p>
              </Screen>
            </Pane>
          </Panes>
        </MemoryRouter>
      </LayoutModeProvider>,
    );
    expect(screen.getByRole('region', { name: 'Details' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Mode' })).not.toBeInTheDocument();
  });
});

describe('redirects in AppShell', () => {
  it.each([
    ['tablet', '/inside', '/'],
    ['desktop', '/train/details', '/train'],
    ['desktop', '/train/charts', '/train'],
  ] as const)('%s %s lands on %s', async (mode, from, to) => {
    render(
      <LayoutModeProvider mode={mode}>
        <MemoryRouter initialEntries={[from]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="*" element={<Where />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </LayoutModeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(new RegExp(`^${to}$`)));
  });

  it('sends /train/run to /train until a run was started', async () => {
    renderApp({ route: '/train/run', mode: 'phone' });
    await waitFor(() => expect(document.title).toContain('Train'));
    expect(screen.getByRole('heading', { level: 1, name: 'Train' })).toBeInTheDocument();
  });

  it('sends /train/run to /train after "Back to settings", even with an old run in memory', async () => {
    act(() => useTrainingStore.setState({ phase: 'idle', jobSettings: runOne.settings }));
    renderApp({ route: '/train/run', mode: 'phone' });
    await waitFor(() => expect(document.title).toContain('Train'));
    expect(screen.getByRole('heading', { level: 1, name: 'Train' })).toBeInTheDocument();
  });

  it('keeps /train/run once a run started', () => {
    act(() => useTrainingStore.setState({ phase: 'running' }));
    renderApp({ route: '/train/run', mode: 'phone' });
    expect(screen.getByRole('heading', { level: 1, name: 'Training' })).toBeInTheDocument();
  });
});
