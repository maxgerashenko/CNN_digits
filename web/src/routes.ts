// The addresses of the app. The app uses hash addresses (#/train), so it
// works from any folder on GitHub Pages without server rules.

import type { LayoutMode } from './types';

export const ROUTES = {
  /** 1 Recognize */
  recognize: '/',
  /** Was 1b How it was read. That is part of Recognize now; the address leads there. */
  inside: '/inside',
  /** 2 Configure */
  train: '/train',
  /** 2b Training */
  training: '/train/run',
  /** 2c Analysis (its own screen on a phone only) */
  details: '/train/details',
  /** 2d Raw charts (its own screen on phone and tablet; on a phone it is also part of Training) */
  charts: '/train/charts',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

/**
 * Screens that are already on the page in a wider layout have no address of
 * their own there. Opening one sends the visitor to the page that shows it.
 * Returns the address to go to, or null when the screen exists in this layout.
 */
export function redirectFor(path: string, mode: LayoutMode): RoutePath | null {
  if (path === ROUTES.inside) return ROUTES.recognize;
  if (mode === 'phone') return null;
  if (path === ROUTES.details) return ROUTES.train;
  if (path === ROUTES.charts && mode === 'desktop') return ROUTES.train;
  return null;
}

/** Which of the two tabs an address belongs to. */
export function tabFor(path: string): 'recognize' | 'train' {
  return path.startsWith(ROUTES.train) ? 'train' : 'recognize';
}
