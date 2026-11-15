import { redirectFor, ROUTES, tabFor } from './routes';

describe('redirectFor', () => {
  it('keeps every screen on the phone, except How it was read, which is part of Recognize', () => {
    for (const path of Object.values(ROUTES)) {
      expect(redirectFor(path, 'phone')).toBe(path === ROUTES.inside ? ROUTES.recognize : null);
    }
  });

  it.each([
    ['tablet', ROUTES.recognize, null],
    ['tablet', ROUTES.inside, ROUTES.recognize],
    ['tablet', ROUTES.train, null],
    ['tablet', ROUTES.training, null],
    ['tablet', ROUTES.details, ROUTES.train],
    ['tablet', ROUTES.charts, null],
    ['desktop', ROUTES.recognize, null],
    ['desktop', ROUTES.inside, ROUTES.recognize],
    ['desktop', ROUTES.train, null],
    ['desktop', ROUTES.training, null],
    ['desktop', ROUTES.details, ROUTES.train],
    ['desktop', ROUTES.charts, ROUTES.train],
  ] as const)('%s %s goes to %s', (mode, path, target) => {
    expect(redirectFor(path, mode)).toBe(target);
  });
});

describe('tabFor', () => {
  it('puts every /train address on the Train tab', () => {
    expect(tabFor(ROUTES.recognize)).toBe('recognize');
    expect(tabFor(ROUTES.inside)).toBe('recognize');
    for (const path of [ROUTES.train, ROUTES.training, ROUTES.details, ROUTES.charts]) {
      expect(tabFor(path)).toBe('train');
    }
  });
});
