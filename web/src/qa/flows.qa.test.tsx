// Whole-app flows across the three layouts: routing, navigation, redirects and
// which screens show side by side. Written against ARCHITECTURE.md sections 3, 4 and 6.

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { AppRoutes } from '../App';
import { LayoutModeProvider } from '../hooks/useLayoutMode';
import { useTrainingStore } from '../state/trainingStore';
import { resetStores } from '../test/utils';
import { runOne, runTwo } from '../test/fixtures';
import type { LayoutMode } from '../types';

/** Shows the address the router is on, so redirects can be checked. */
function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

/** The whole route tree in a fixed layout, with a probe for the current address. */
function renderAt(route: string, mode: LayoutMode) {
  return render(
    <LayoutModeProvider mode={mode}>
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
        <Where />
      </MemoryRouter>
    </LayoutModeProvider>,
  );
}

const where = () => screen.getByTestId('where').textContent;

/** Makes the tab look like a run was finished: the run is in the store and the job settings are kept. */
function seedRuns() {
  act(() => {
    useTrainingStore.setState({
      runs: [runOne, runTwo],
      phase: 'done',
      jobSettings: runTwo.settings,
    });
  });
}

/** Every link on the page as its address (the router gives relative addresses). */
function linkTargets(): string[] {
  return screen.getAllByRole('link').map((link) => link.getAttribute('href') ?? '');
}

/** The header back link of a pushed screen, or null when there is none. */
function backLink(): HTMLAnchorElement | null {
  const header = document.querySelector('header');
  return header?.querySelector('a') ?? null;
}

beforeEach(() => resetStores());

// 1. Every route renders, and lands where the architecture says.

describe('every route renders and lands at its address', () => {
  // [route, mode, address after redirects, heading that must be shown (or null when the mode has several)]
  const cases: [string, LayoutMode, string, string | null][] = [
    ['/', 'phone', '/', 'Recognize'],
    ['/inside', 'phone', '/inside', 'How it was read'],
    ['/train', 'phone', '/train', 'Train'],
    ['/train/run', 'phone', '/train', 'Train'],
    ['/train/details', 'phone', '/train/details', 'Run details'],
    ['/train/charts', 'phone', '/train/charts', 'Raw charts'],
    ['/', 'tablet', '/', 'Recognize'],
    ['/inside', 'tablet', '/', 'Recognize'],
    ['/train', 'tablet', '/train', 'Train'],
    ['/train/run', 'tablet', '/train', 'Train'],
    ['/train/details', 'tablet', '/train', 'Train'],
    ['/train/charts', 'tablet', '/train/charts', 'Raw charts'],
    ['/', 'desktop', '/', null],
    ['/inside', 'desktop', '/', null],
    ['/train', 'desktop', '/train', null],
    ['/train/run', 'desktop', '/train', null],
    ['/train/details', 'desktop', '/train', null],
    ['/train/charts', 'desktop', '/train', null],
  ];

  it.each(cases)('%s in %s mode ends at %s', (route, mode, address, heading) => {
    renderAt(route, mode);
    expect(where()).toBe(address);
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings.length).toBeGreaterThan(0);
    if (heading !== null) {
      expect(headings.map((h) => h.textContent)).toContain(heading);
    }
  });

  it.each(['phone', 'tablet', 'desktop'] as LayoutMode[])('%s: /train/run with a run started stays on Training', (mode) => {
    seedRuns();
    renderAt('/train/run', mode);
    expect(where()).toBe('/train/run');
    expect(screen.getAllByRole('heading', { level: mode === 'desktop' ? 2 : 1 }).map((h) => h.textContent)).toContain('Training');
  });
});

// 2. The navigation each mode should have, and no other.

describe('navigation per layout', () => {
  it('phone: the bottom tab bar on the two root screens, and no header pill or rail', () => {
    renderAt('/', 'phone');
    const navs = screen.getAllByRole('navigation', { name: 'Mode' });
    expect(navs).toHaveLength(1);
    expect(navs[0].closest('header')).toBeNull();
    expect(navs[0].closest('aside')).toBeNull();
    expect(document.querySelector('aside')).toBeNull();
  });

  it('phone: no tab bar on pushed screens', () => {
    seedRuns();
    for (const route of ['/inside', '/train/run', '/train/details', '/train/charts']) {
      const { unmount } = renderAt(route, 'phone');
      expect(screen.queryByRole('navigation', { name: 'Mode' })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('tablet: the header pill only, no tab bar at the bottom, no rail', () => {
    renderAt('/train', 'tablet');
    const navs = screen.getAllByRole('navigation', { name: 'Mode' });
    expect(navs).toHaveLength(1);
    expect(navs[0].closest('header')).not.toBeNull();
    expect(navs[0].closest('aside')).toBeNull();
    expect(document.querySelector('aside')).toBeNull();
  });

  it('desktop: the rail only, no header pill and no tab bar', () => {
    renderAt('/', 'desktop');
    const navs = screen.getAllByRole('navigation', { name: 'Mode' });
    expect(navs).toHaveLength(1);
    expect(navs[0].closest('aside')).not.toBeNull();
    expect(navs[0].closest('header')).toBeNull();
    expect(document.querySelector('aside')).toContainElement(navs[0]);
    expect(screen.getByText('Saved model', { selector: 'span' })).toBeInTheDocument();
  });
});

// 3. Moving between Recognize and Train and back.

describe('moving Recognize to Train and back', () => {
  it('phone: tab bar switches both ways', async () => {
    const user = userEvent.setup();
    renderAt('/', 'phone');
    await user.click(screen.getByRole('link', { name: 'Train' }));
    expect(where()).toBe('/train');
    expect(screen.getByRole('link', { name: 'Train' })).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('link', { name: 'Recognize' }));
    expect(where()).toBe('/');
    expect(screen.getByRole('link', { name: 'Recognize' })).toHaveAttribute('aria-current', 'page');
  });

  it('tablet: header pill switches both ways', async () => {
    const user = userEvent.setup();
    renderAt('/', 'tablet');
    await user.click(screen.getByRole('link', { name: 'Train' }));
    expect(where()).toBe('/train');
    expect(screen.getByRole('heading', { level: 1, name: 'Train' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Recognize' }));
    expect(where()).toBe('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Recognize' })).toBeInTheDocument();
  });

  it('desktop: rail switches both ways', async () => {
    const user = userEvent.setup();
    renderAt('/', 'desktop');
    await user.click(screen.getByRole('link', { name: 'Train' }));
    expect(where()).toBe('/train');
    await user.click(screen.getByRole('link', { name: 'Recognize' }));
    expect(where()).toBe('/');
  });
});

// 4. Pushed screens on the phone have a back link to the right parent.

describe('phone back links of pushed screens', () => {
  it('How it was read goes back to Recognize', () => {
    renderAt('/inside', 'phone');
    expect(backLink()).toHaveAttribute('href', '/');
  });

  it('Training goes back to Train settings', () => {
    seedRuns();
    renderAt('/train/run', 'phone');
    expect(backLink()).toHaveAttribute('href', '/train');
  });

  it('Run details goes back to Train settings', () => {
    renderAt('/train/details', 'phone');
    expect(backLink()).toHaveAttribute('href', '/train');
  });

  it('Raw charts goes back to Run details', () => {
    renderAt('/train/charts', 'phone');
    expect(backLink()).toHaveAttribute('href', '/train/details');
  });

  it('the back link takes the visitor to the parent', async () => {
    const user = userEvent.setup();
    renderAt('/train/charts', 'phone');
    await user.click(backLink()!);
    expect(where()).toBe('/train/details');
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toContain('Run details');
  });
});

// 5. Redirects for screens that are already visible in a wider layout.

describe('redirects for screens already on the page', () => {
  it.each([
    ['tablet', '/inside', '/'],
    ['desktop', '/inside', '/'],
    ['tablet', '/train/details', '/train'],
    ['desktop', '/train/details', '/train'],
    ['desktop', '/train/charts', '/train'],
  ] as [LayoutMode, string, string][])('%s %s goes to %s', (mode, from, to) => {
    renderAt(from, mode);
    expect(where()).toBe(to);
  });

  it('tablet keeps Raw charts as its own pushed screen', () => {
    renderAt('/train/charts', 'tablet');
    expect(where()).toBe('/train/charts');
    expect(backLink()).toHaveAttribute('href', '/train/details');
  });

  it('phone keeps every pushed address', () => {
    seedRuns();
    for (const route of ['/inside', '/train/details', '/train/charts', '/train/run']) {
      const { unmount } = renderAt(route, 'phone');
      expect(where()).toBe(route);
      unmount();
    }
  });
});

// 6. /train/run with no run started, and unknown addresses.

describe('address fallbacks', () => {
  it.each(['phone', 'tablet', 'desktop'] as LayoutMode[])('%s: /train/run with no run goes to /train', (mode) => {
    renderAt('/train/run', mode);
    expect(where()).toBe('/train');
  });

  it.each(['phone', 'tablet', 'desktop'] as LayoutMode[])('%s: an unknown address shows Recognize', (mode) => {
    renderAt('/no-such-screen', mode);
    expect(screen.getAllByRole('heading', { level: mode === 'desktop' ? 2 : 1 }).map((h) => h.textContent)).toContain('Recognize');
    if (mode === 'phone') {
      expect(screen.getByRole('link', { name: 'Recognize' })).toHaveAttribute('aria-current', 'page');
    }
    if (mode === 'desktop') {
      expect(screen.getByRole('region', { name: 'Draw and result' })).toBeInTheDocument();
    }
  });

  it('an unknown address under train counts as Train in the tab bar', () => {
    renderAt('/train/unknown', 'phone');
    expect(screen.getByRole('link', { name: 'Train' })).toHaveAttribute('aria-current', 'page');
  });
});

// 7. Desktop panes.

describe('desktop panes', () => {
  it('Recognize has the two panes: draw and result, how it was read', () => {
    renderAt('/', 'desktop');
    expect(screen.getByRole('region', { name: 'Draw and result' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'How it was read' })).toBeInTheDocument();
  });

  it('Train has the three panes: settings, run details, raw charts', () => {
    renderAt('/train', 'desktop');
    expect(screen.getByRole('region', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Run details' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Raw charts' })).toBeInTheDocument();
  });

  it('Training has the three panes too, replacing Settings', () => {
    seedRuns();
    renderAt('/train/run', 'desktop');
    expect(screen.getByRole('region', { name: 'Training' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Run details' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Raw charts' })).toBeInTheDocument();
  });

  it('panes have no back button in their header', () => {
    seedRuns();
    renderAt('/train/run', 'desktop');
    const panes = screen.getAllByRole('region');
    expect(panes.length).toBeGreaterThan(0);
    for (const pane of panes) {
      expect(pane.querySelector('header a')).toBeNull();
    }
  });
});

// 8. Links to screens already visible next to the current one are left out on desktop.

describe('links hidden inside desktop panes', () => {
  const HIDDEN = ['/inside', '/train/details', '/train/charts'];

  it('Recognize pane: no link to How it was read', () => {
    renderAt('/', 'desktop');
    expect(linkTargets()).not.toContain('/inside');
  });

  it('Train pane without a run: no link to Run details or Raw charts', () => {
    renderAt('/train', 'desktop');
    const targets = linkTargets();
    for (const target of HIDDEN) expect(targets).not.toContain(target);
  });

  it('Train pane with a run: last-run card has no link to Run details', () => {
    seedRuns();
    renderAt('/train', 'desktop');
    expect(linkTargets()).not.toContain('/train/details');
    expect(screen.getByText(/98\.6% · 138 mistakes/)).toBeInTheDocument();
    expect(linkTargets()).not.toContain('/train/charts');
  });

  it('Training pane: no All metrics link, Run details has no Raw charts link', () => {
    seedRuns();
    renderAt('/train/run', 'desktop');
    const targets = linkTargets();
    expect(targets).not.toContain('/train/details');
    expect(targets).not.toContain('/train/charts');
  });
});

// 9. A finished run in the store: Train, Details and Charts show it.

describe('with a finished run in the store', () => {
  it('phone Train shows the last run (run 2), not run 1', () => {
    seedRuns();
    renderAt('/train', 'phone');
    expect(screen.getByText(/98\.6% · 138 mistakes/)).toBeInTheDocument();
    expect(screen.queryByText(/97\.9%/)).not.toBeInTheDocument();
  });

  it('phone Run details shows the run and the one before it in the legend', () => {
    seedRuns();
    renderAt('/train/details', 'phone');
    expect(screen.getByRole('heading', { level: 1, name: 'Run details' })).toBeInTheDocument();
    expect(screen.getAllByText('run 2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('run 1').length).toBeGreaterThan(0);
    expect(screen.queryByText('No runs yet')).not.toBeInTheDocument();
  });

  it('phone Raw charts shows the latest run numbers', () => {
    seedRuns();
    renderAt('/train/charts', 'phone');
    const kpis = screen.getByLabelText('Latest run');
    expect(within(kpis).getByText('98.6%')).toBeInTheDocument();
    expect(within(kpis).getByText('138')).toBeInTheDocument();
    expect(screen.queryByText('No runs yet')).not.toBeInTheDocument();
  });

  it('desktop Train shows the last run in the settings pane and the details and charts beside it', () => {
    seedRuns();
    renderAt('/train', 'desktop');
    expect(screen.getByText(/98\.6% · 138 mistakes/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Run details' })).getAllByText('run 2').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('region', { name: 'Raw charts' })).getByLabelText('Latest run')).toBeInTheDocument();
  });
});
