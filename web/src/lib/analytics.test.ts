import { afterEach, describe, expect, it } from 'vitest';

import { initAnalytics, resetAnalyticsForTests, trackPageView } from './analytics';

function gaScripts() {
  return document.querySelectorAll('script[src*="googletagmanager.com/gtag/js"]');
}

afterEach(() => {
  resetAnalyticsForTests();
  gaScripts().forEach((s) => s.remove());
  delete window.gtag;
  delete window.dataLayer;
});

describe('analytics', () => {
  it('does nothing without a measurement ID', () => {
    expect(initAnalytics('')).toBe(false);
    trackPageView('/train');
    expect(gaScripts()).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
  });

  it('loads gtag.js once and sends page views with the hash address', () => {
    expect(initAnalytics('G-TEST123')).toBe(true);
    expect(initAnalytics('G-TEST123')).toBe(true);
    expect(gaScripts()).toHaveLength(1);
    expect(gaScripts()[0].getAttribute('src')).toContain('id=G-TEST123');

    trackPageView('/train');
    const last = Array.from(window.dataLayer!.at(-1) as IArguments);
    expect(last[0]).toBe('event');
    expect(last[1]).toBe('page_view');
    expect(last[2]).toMatchObject({ page_path: '/train' });
    expect((last[2] as { page_location: string }).page_location).toMatch(/#\/train$/);
  });
});
