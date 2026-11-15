import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom has no matchMedia; give it a default that matches nothing.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom has no canvas; a drawing context that accepts every call.
if (typeof HTMLCanvasElement !== 'undefined') {
  const noop = () => {};
  const context = new Proxy(
    { canvas: null as unknown },
    {
      get: (target, key) => {
        if (key in target) return (target as Record<string | symbol, unknown>)[key];
        if (key === 'getImageData' || key === 'createImageData') {
          return (w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w * h) * 4), width: w, height: h });
        }
        if (key === 'measureText') return () => ({ width: 0 });
        return noop;
      },
      set: () => true,
    },
  );
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return context as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement['getContext'];
}
