// Rules for every stylesheet under src/: the layout comes from flexbox and the
// one breakpoint rule in useLayoutMode, and colours come from tokens.css.

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/** Reads every stylesheet under src/ as text, keyed by its path from src/. */
function allCss(): Record<string, string> {
  // Vitest runs from web/, so the folder is found from the working directory.
  const root = join(process.cwd(), 'src');
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.css')) out[relative(root, path)] = readFileSync(path, 'utf8');
    }
  };
  walk(root);
  return out;
}

/** The file that defines the colour tokens; the only place literal colours belong. */
const TOKENS = join('styles', 'tokens.css');

function linesMatching(css: Record<string, string>, pattern: RegExp) {
  return Object.entries(css)
    .map(([file, text]) => [file, text.split('\n').filter((line) => pattern.test(line))] as const)
    .filter(([, lines]) => lines.length > 0);
}

describe('CSS rules for all of src/', () => {
  const css = allCss();

  it('finds the stylesheets', () => {
    expect(Object.keys(css).length).toBeGreaterThan(20);
    expect(css[TOKENS]).toBeDefined();
  });

  it('has no literal colours outside tokens.css', () => {
    const rest = Object.fromEntries(Object.entries(css).filter(([file]) => file !== TOKENS));
    expect(linesMatching(rest, /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/)).toEqual([]);
  });

  it('has no width media queries', () => {
    expect(linesMatching(css, /@media[^{]*width/)).toEqual([]);
  });

  it('does not use display: grid', () => {
    expect(linesMatching(css, /display:\s*(?:inline-)?grid\b/)).toEqual([]);
  });
});
