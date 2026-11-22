import { afterEach, describe, expect, it } from 'vitest';

import { initAnalytics, resetAnalyticsForTests, trackPageView } from './analytics';

function gtmScripts() {
  return document.querySelectorAll('script[src*="googletagmanager.com/gtm.js"]');
}

afterEach(() => {
  resetAnalyticsForTests();
  gtmScripts().forEach((s) => s.remove());
  delete window.dataLayer;
});

describe('analytics', () => {
  it('does nothing without a container ID', () => {
    expect(initAnalytics('')).toBe(false);
    trackPageView('/train');
    expect(gtmScripts()).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
  });

  it('loads gtm.js once and pushes page views with the hash address', () => {
    expect(initAnalytics('GTM-TEST123')).toBe(true);
    expect(initAnalytics('GTM-TEST123')).toBe(true);
    expect(gtmScripts()).toHaveLength(1);
    expect(gtmScripts()[0].getAttribute('src')).toContain('id=GTM-TEST123');
    expect(window.dataLayer![0]).toMatchObject({ event: 'gtm.js' });

    trackPageView('/train');
    const last = window.dataLayer!.at(-1) as Record<string, string>;
    expect(last).toMatchObject({ event: 'page_view', page_path: '/train' });
    expect(last.page_location).toMatch(/#\/train$/);
  });
});
