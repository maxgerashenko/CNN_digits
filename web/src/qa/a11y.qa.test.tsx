// Accessibility checks of every screen, run through the whole app.
// Uses Testing Library role and name queries only (no axe). Each check
// returns a list of readable violations; a test fails with that list.

import { act, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useTrainingStore } from '../state/trainingStore';
import { renderApp, resetStores } from '../test/utils';
import { runOne, runTwo } from '../test/fixtures';
import type { LayoutMode } from '../types';

const PHONE_ROUTES = ['/', '/inside', '/train', '/train/run', '/train/details', '/train/charts'] as const;
const ROOT_ROUTES = ['/', '/train'] as const;

function setRunState(withRun: boolean) {
  act(() => {
    if (withRun) {
      useTrainingStore.setState({ runs: [runOne, runTwo], jobSettings: runTwo.settings, phase: 'idle' });
    }
  });
}

/** Short text of an element, for messages. */
function short(el: Element): string {
  return el.outerHTML.replace(/\s+/g, ' ').slice(0, 160);
}

/** Visible text of an element, normalised. Used to read link names for the duplicate check. */
function textOf(el: Element): string {
  return (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Elements of a role that Testing Library finds with no accessible name at all. */
function unnamed(role: string): Element[] {
  const all = within(document.body).queryAllByRole(role as never);
  const named = within(document.body).queryAllByRole(role as never, { name: /\S/ });
  return all.filter((el) => !named.includes(el));
}

/** Runs every rule that applies to the whole page. Returns the violations found. */
function auditPage(): string[] {
  const problems: string[] = [];
  const page = within(document.body);

  // One h1 on the page.
  const h1s = document.querySelectorAll('h1');
  if (h1s.length !== 1) problems.push(`expected exactly one h1, found ${h1s.length}`);

  // Heading levels never skip a level going down.
  let previous = 0;
  document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((heading) => {
    const level = Number(heading.tagName.charAt(1));
    if (previous > 0 && level > previous + 1) {
      problems.push(`heading level skips from h${previous} to h${level}: ${short(heading)}`);
    }
    previous = level;
  });

  // Buttons and links need a non-empty accessible name.
  for (const role of ['button', 'link']) {
    for (const el of unnamed(role)) problems.push(`${role} without accessible name: ${short(el)}`);
  }

  // Form controls need a name.
  for (const role of ['slider', 'switch', 'radio', 'spinbutton', 'checkbox', 'img']) {
    for (const el of unnamed(role)) problems.push(`${role} without accessible name: ${short(el)}`);
  }

  // Every svg is either hidden from assistive tech or named.
  document.querySelectorAll('svg').forEach((svg) => {
    const hidden = svg.closest('[aria-hidden="true"]') !== null;
    const named = svg.getAttribute('aria-label') !== null || svg.querySelector('title') !== null;
    if (!hidden && !named) problems.push(`svg neither aria-hidden nor named: ${short(svg)}`);
  });

  // No two links with the same name inside one landmark.
  const landmarks = [
    ...page.queryAllByRole('navigation'),
    ...page.queryAllByRole('complementary'),
    ...page.queryAllByRole('main'),
    ...page.queryAllByRole('banner'),
    ...page.queryAllByRole('contentinfo'),
  ];
  for (const landmark of landmarks) {
    const seen = new Map<string, number>();
    for (const link of within(landmark).queryAllByRole('link')) {
      const name = textOf(link);
      seen.set(name, (seen.get(name) ?? 0) + 1);
    }
    for (const [name, count] of seen) {
      if (count > 1) problems.push(`${count} links named "${name}" in one ${landmark.tagName.toLowerCase()}`);
    }
  }

  // Buttons in a group of choices (segmented control) report which one is pressed.
  // Stepper buttons are named "<label>: less" / "<label>: more" and have no pressed state.
  for (const group of page.queryAllByRole('group')) {
    for (const button of within(group).queryAllByRole('button')) {
      const name = button.getAttribute('aria-label') ?? '';
      const isStepper = /: (less|more)$/.test(name);
      if (!isStepper && !button.hasAttribute('aria-pressed')) {
        problems.push(`button in group "${group.getAttribute('aria-label')}" has no aria-pressed: ${short(button)}`);
      }
    }
  }

  // A control that only looks disabled (aria-disabled, or a "disabled" class) must be disabled.
  document.querySelectorAll('[aria-disabled="true"]').forEach((el) => {
    if (!(el as HTMLButtonElement).disabled) problems.push(`aria-disabled without real disabled: ${short(el)}`);
  });
  document.querySelectorAll('[class*="disabled"]').forEach((el) => {
    if (el.tagName === 'BUTTON' && !(el as HTMLButtonElement).disabled) {
      problems.push(`button styled as disabled but not disabled: ${short(el)}`);
    }
    if (el.tagName === 'A') problems.push(`link styled as disabled: ${short(el)}`);
  });

  return problems;
}

beforeEach(() => resetStores());

describe.each(PHONE_ROUTES.map((route) => [route] as const))('phone %s', (route) => {
  it.each([false, true])('passes the page audit, with a run in the store: %s', (withRun) => {
    renderApp({ route, mode: 'phone' });
    setRunState(withRun);
    expect(auditPage()).toEqual([]);
  });
});

describe.each(
  (['tablet', 'desktop'] as LayoutMode[]).flatMap((mode) => ROOT_ROUTES.map((route) => [mode, route] as const)),
)('%s %s', (mode, route) => {
  it.each([false, true])('passes the page audit, with a run in the store: %s', (withRun) => {
    renderApp({ route, mode });
    setRunState(withRun);
    expect(auditPage()).toEqual([]);
  });
});

describe('current navigation item', () => {
  const cases: [LayoutMode, string, string][] = [
    ['phone', '/', 'Recognize'],
    ['phone', '/train', 'Train'],
    ['tablet', '/', 'Recognize'],
    ['tablet', '/train', 'Train'],
    ['desktop', '/', 'Recognize'],
    ['desktop', '/train', 'Train'],
  ];
  it.each(cases)('%s at %s marks %s with aria-current', (mode, route, current) => {
    renderApp({ route, mode });
    const nav = within(document.body).getByRole('navigation', { name: 'Mode' });
    const links = within(nav).getAllByRole('link');
    const active = links.find((link) => link.textContent?.includes(current));
    const other = links.find((link) => !link.textContent?.includes(current));
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(other).not.toHaveAttribute('aria-current');
  });
});

describe('keyboard and sanity', () => {
  it('the drawing pad is an image with a name, and Clear drawing is focusable', () => {
    renderApp({ route: '/', mode: 'phone' });
    const pad = within(document.body).getByRole('img', { name: /Drawing pad, 28 by 28 cells/ });
    expect(pad).toBeInTheDocument();
    const clear = within(document.body).getByRole('button', { name: 'Clear drawing' });
    clear.focus();
    expect(clear).toHaveFocus();
  });

  it('the audit is not empty: /train has segmented choices with aria-pressed', () => {
    renderApp({ route: '/train', mode: 'phone' });
    const pressed = within(document.body)
      .queryAllByRole('button')
      .filter((b) => b.hasAttribute('aria-pressed'));
    expect(pressed.length).toBeGreaterThan(0);
  });
});

describe('toggles and controls', () => {
  it('the advanced settings row is a disclosure with aria-expanded', () => {
    renderApp({ route: '/train', mode: 'phone' });
    const toggle = within(document.body).getByRole('button', { name: /Advanced settings/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('a switch reports checked state and a name', () => {
    renderApp({ route: '/train', mode: 'phone' });
    const switches = within(document.body).queryAllByRole('switch');
    for (const sw of switches) {
      expect(sw).toHaveAttribute('aria-checked');
      expect(sw.getAttribute('aria-label')?.trim().length).toBeGreaterThan(0);
    }
  });

  it('a stepper at its limit has its button disabled as an attribute', () => {
    renderApp({ route: '/train', mode: 'phone' });
    let steppers = 0;
    for (const group of within(document.body).queryAllByRole('group')) {
      const buttons = within(group).queryAllByRole('button');
      const minus = buttons.find((b) => (b.getAttribute('aria-label') ?? '').endsWith(': less'));
      const plus = buttons.find((b) => (b.getAttribute('aria-label') ?? '').endsWith(': more'));
      if (!minus || !plus) continue;
      steppers++;
      const value = Number(within(group).getByText(/^-?\d+(\.\d+)?$/).textContent);
      const label = group.getAttribute('aria-label');
      // The attribute is what the user and assistive tech see; a style alone is not enough.
      if (value <= 0) expect(minus, `${label} minus at ${value}`).toBeDisabled();
      expect(plus, `${label} plus`).toBeInstanceOf(HTMLButtonElement);
    }
    expect(steppers).toBeGreaterThan(0);
  });
});
