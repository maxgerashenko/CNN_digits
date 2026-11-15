import { render, screen } from '@testing-library/react';

import { PixelGrid } from './PixelGrid';

describe('PixelGrid', () => {
  it('keeps cells sharp when there are no lines', () => {
    render(<PixelGrid data={null} size={7} label="map" />);
    expect(screen.getByRole('img', { name: 'map' }).className).toMatch(/pixelated/);
  });

  it('does not use pixelated rendering with lines', () => {
    render(<PixelGrid data={null} size={28} lines label="pad" />);
    expect(screen.getByRole('img', { name: 'pad' }).className).not.toMatch(/pixelated/);
  });
});
