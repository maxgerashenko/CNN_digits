// Google Tag Manager. The Google Analytics tag is set up inside the GTM
// container, not here. Off when no container ID is set: then no script is
// loaded and every call here does nothing.

import { GTM_ID } from '../config';

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

let activeId = '';

/**
 * Loads gtm.js for the given container ID, once.
 * Returns true when analytics is on.
 */
export function initAnalytics(id: string = GTM_ID): boolean {
  if (!id || typeof document === 'undefined') return false;
  if (activeId) return true;
  activeId = id;

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
  return true;
}

/**
 * Tells GTM the visitor moved to an app address such as "/train". The app
 * uses hash addresses (#/train), so the browser address alone does not show
 * the screen. In GTM this is the custom event "page_view" with page_path,
 * page_location and page_title.
 */
export function trackPageView(path: string): void {
  if (!activeId || !window.dataLayer) return;
  const { origin, pathname } = window.location;
  window.dataLayer.push({
    event: 'page_view',
    page_path: path,
    page_location: `${origin}${pathname}#${path}`,
    page_title: document.title,
  });
}

/** Only for tests: forget the loaded ID. */
export function resetAnalyticsForTests(): void {
  activeId = '';
}
