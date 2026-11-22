// Google Analytics 4 (gtag.js). Off unless a measurement ID is set: then no
// script is loaded and every call here does nothing.

import { GA_MEASUREMENT_ID } from '../config';

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

let activeId = '';

/**
 * Loads gtag.js for the given measurement ID. Page views are sent by
 * trackPageView, because the app uses hash addresses (#/train) that Google
 * would otherwise count as one page.
 * Returns true when analytics is on.
 */
export function initAnalytics(id: string = GA_MEASUREMENT_ID): boolean {
  if (!id || typeof document === 'undefined') return false;
  if (activeId) return true;
  activeId = id;

  window.dataLayer = window.dataLayer ?? [];
  // gtag.js reads the `arguments` objects pushed here, not plain arrays.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', id, { send_page_view: false });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
  return true;
}

/** Sends one page view for an app address such as "/train". */
export function trackPageView(path: string): void {
  if (!activeId || !window.gtag) return;
  const { origin, pathname } = window.location;
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: `${origin}${pathname}#${path}`,
    page_title: document.title,
  });
}

/** Only for tests: forget the loaded ID. */
export function resetAnalyticsForTests(): void {
  activeId = '';
}
