import { layoutModeForWidth } from './useLayoutMode';

describe('layoutModeForWidth', () => {
  it.each([
    [320, 'phone'],
    [1023, 'phone'],
    [1024, 'tablet'],
    [1279, 'tablet'],
    [1280, 'desktop'],
  ] as const)('%i px is %s', (width, mode) => {
    expect(layoutModeForWidth(width)).toBe(mode);
  });
});
