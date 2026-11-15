// Which of the three layouts to show. The whole app asks this one hook, so
// the rule lives in one place. CSS files do not repeat it with media queries.

import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';

import type { LayoutMode } from '../types';

/** Smallest window width, in CSS pixels, of the tablet and the desktop layout. */
export const BREAKPOINTS = { tablet: 1024, desktop: 1200 } as const;

export function layoutModeForWidth(width: number): LayoutMode {
  if (width >= BREAKPOINTS.desktop) return 'desktop';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  return 'phone';
}

const OverrideContext = createContext<LayoutMode | null>(null);

const QUERIES = [`(min-width: ${BREAKPOINTS.desktop}px)`, `(min-width: ${BREAKPOINTS.tablet}px)`];

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const lists = QUERIES.map((query) => window.matchMedia(query));
  lists.forEach((list) => list.addEventListener('change', onChange));
  return () => lists.forEach((list) => list.removeEventListener('change', onChange));
}

function readMode(): LayoutMode {
  if (typeof window === 'undefined' || !window.matchMedia) return 'phone';
  if (window.matchMedia(QUERIES[0]).matches) return 'desktop';
  if (window.matchMedia(QUERIES[1]).matches) return 'tablet';
  return 'phone';
}

/** 'phone', 'tablet' or 'desktop', following the window width. */
export function useLayoutMode(): LayoutMode {
  const forced = useContext(OverrideContext);
  const measured = useSyncExternalStore(subscribe, readMode, () => 'phone' as LayoutMode);
  return forced ?? measured;
}

/** Fixes the layout for everything inside. For tests and previews. */
export function LayoutModeProvider({ mode, children }: { mode: LayoutMode; children: ReactNode }) {
  return <OverrideContext.Provider value={mode}>{children}</OverrideContext.Provider>;
}
