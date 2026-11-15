import { render, screen } from '@testing-library/react';

import { countParams } from '../../lib/architecture';
import { formatInt } from '../../lib/format';
import { settingsWith } from '../../test/fixtures';
import { NetworkDiagram } from './NetworkDiagram';
import { buildNetworkGeometry } from './networkGeometry';

describe('NetworkDiagram', () => {
  it('shows weight count, size chain and labels from the settings', () => {
    const s = settingsWith({ conv_blocks: 2, filters: 16, dense_units: 128 });
    const { container } = render(<NetworkDiagram settings={s} />);
    expect(screen.getByText(formatInt(countParams(s)))).toBeInTheDocument();
    expect(screen.getByText('28 → 14 → 7')).toBeInTheDocument();
    for (const t of ['In', '28×28', 'B1', '16@14', 'B2', '32@7', 'Out', '10']) {
      expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('describes the network in words and updates with settings', () => {
    const { rerender } = render(<NetworkDiagram settings={settingsWith({ conv_blocks: 1, dense_layers: 0 })} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/1 conv block with .* no hidden dense layers, 10 outputs/);
    rerender(<NetworkDiagram settings={settingsWith({ conv_blocks: 3, dense_layers: 2 })} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/3 conv blocks .* 2 hidden dense layers/);
    expect(screen.getByText('28 → 14 → 7 → 3')).toBeInTheDocument();
  });

  it('draws dashed outlines without batch norm and hollow dots for dropout', () => {
    const on = buildNetworkGeometry(settingsWith({ batch_norm: true, dropout: 0 }));
    const off = buildNetworkGeometry(settingsWith({ batch_norm: false, dropout: 0.5 }));
    expect(on.rects.some((r) => r.dashed)).toBe(false);
    expect(off.rects.some((r) => r.dashed)).toBe(true);
    expect(on.dots.some((d) => d.hollow)).toBe(false);
    expect(off.dots.filter((d) => d.hollow).length).toBe(3);
    expect(off.dots.length).toBe(6 + 10);
  });

  it('gives the same lines on every render', () => {
    const s = settingsWith();
    expect(buildNetworkGeometry(s)).toEqual(buildNetworkGeometry(s));
  });

  it('is sticky only when asked', () => {
    const { container, rerender } = render(<NetworkDiagram settings={settingsWith()} />);
    const plain = (container.firstChild as HTMLElement).className;
    rerender(<NetworkDiagram settings={settingsWith()} sticky />);
    expect((container.firstChild as HTMLElement).className).not.toBe(plain);
  });
});
