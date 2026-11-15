// Geometry of the network diagram, in a 332 x 164 box (the label row is HTML
// under it). Follows the design's script: input square with the kernel box,
// one stack per conv block, dense columns, 10 outputs, lines between columns.
// Pure and deterministic: the line pattern comes from a sine hash, not Math.random.

import { describeArchitecture, IMAGE_SIZE, OUTPUT_UNITS } from '../../lib/architecture';
import type { Settings } from '../../types';

export const DIAGRAM_WIDTH = 332;
export const DIAGRAM_HEIGHT = 164;

export type Tone = 'line' | 'accent' | 'bg' | 'surface' | 'dim';

export interface DiagramLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  tone: Tone;
  opacity: number;
}

export interface DiagramRect {
  x: number;
  y: number;
  size: number;
  radius: number;
  fill: Tone;
  fillOpacity: number;
  stroke: Tone | null;
  dashed: boolean;
}

export interface DiagramDot {
  x: number;
  y: number;
  size: number;
  hollow: boolean;
}

export interface DiagramLabel {
  /** Centre of the label, as a share (0..1) of the diagram width. */
  center: number;
  /** Width of the label, as a share of the diagram width. */
  width: number;
  title: string;
  detail: string;
}

export interface NetworkGeometry {
  lines: DiagramLine[];
  rects: DiagramRect[];
  dots: DiagramDot[];
  labels: DiagramLabel[];
  /** "28 → 14 → 7" */
  sizeChain: string;
}

const PAD = 26;
const CY = 82;
const STACK_SIZES = [36, 28, 20];

const r1 = (v: number) => Math.round(v * 10) / 10;

export function buildNetworkGeometry(settings: Settings): NetworkGeometry {
  const arch = describeArchitecture(settings);
  const B = arch.blocks.length;
  const D = arch.dense.length;
  const n = 1 + B + D + 1;
  const step = (DIAGRAM_WIDTH - PAD * 2) / (n - 1);
  const cx = (i: number) => PAD + i * step;

  const lines: DiagramLine[] = [];
  const rects: DiagramRect[] = [];
  const labels: DiagramLabel[] = [];
  let seed = 1;
  const rnd = () => {
    const x = Math.sin(seed++ * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  const line = (x1: number, y1: number, x2: number, y2: number, width: number, tone: Tone, opacity: number) =>
    lines.push({ x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2), width, tone, opacity });
  const label = (i: number, title: string, detail: string) =>
    labels.push({ center: cx(i) / DIAGRAM_WIDTH, width: step / DIAGRAM_WIDTH, title, detail });

  // Input square and the kernel box inside it.
  rects.push({ x: cx(0) - 20, y: CY - 20, size: 40, radius: 1, fill: 'bg', fillOpacity: 1, stroke: 'line', dashed: false });
  rects.push({
    x: cx(0) - 17,
    y: CY - 17,
    size: settings.kernel_size * 5,
    radius: 0,
    fill: 'accent',
    fillOpacity: 0.25,
    stroke: 'accent',
    dashed: false,
  });
  label(0, 'In', `${IMAGE_SIZE}×${IMAGE_SIZE}`);

  let right = cx(0) + 20;
  let lastSize = 40;
  arch.blocks.forEach((block, b) => {
    const sz = STACK_SIZES[b] ?? 20;
    const x0 = cx(b + 1);
    const depth = Math.max(2, Math.min(6, Math.round(Math.log2(block.filters)) - 1));
    const left = x0 - sz / 2 - (depth - 1) * 1.5;
    line(right + 2, CY, left - 2, CY, 1, 'line', 0.6);
    for (let j = 0; j < depth; j++) {
      const off = (j - (depth - 1) / 2) * 3;
      rects.push({
        x: r1(x0 - sz / 2 + off),
        y: r1(CY - sz / 2 - off),
        size: sz,
        radius: 1,
        fill: 'surface',
        fillOpacity: 1,
        stroke: 'accent',
        dashed: !arch.batchNorm,
      });
    }
    const convs = block.convLayers;
    for (let c = 0; c < convs; c++) {
      rects.push({
        x: r1(x0 - (convs * 6 + (convs - 1) * 4) / 2 + c * 10),
        y: 24,
        size: 6,
        radius: 0,
        fill: 'accent',
        fillOpacity: 1,
        stroke: null,
        dashed: false,
      });
    }
    label(b + 1, `B${b + 1}`, `${block.filters}@${block.outSize}`);
    right = x0 + sz / 2 + (depth - 1) * 1.5;
    lastSize = sz;
  });

  // Dense columns (6 dots, some hollow for dropout) and the 10 outputs.
  const hollowCount = Math.round(settings.dropout * 6);
  const columns: { x: number; y: number; size: number; hollow: boolean }[][] = [];
  for (let d = 0; d < D; d++) {
    const pts = [];
    for (let j = 0; j < 6; j++) {
      pts.push({ x: cx(1 + B + d), y: CY + (j - 2.5) * 22, size: 10, hollow: (j * 5 + d * 2) % 6 < hollowCount });
    }
    columns.push(pts);
    label(1 + B + d, 'Dense', String(settings.dense_units));
  }
  const outs = [];
  for (let j = 0; j < OUTPUT_UNITS; j++) {
    outs.push({ x: cx(n - 1), y: CY + (j - 4.5) * 14, size: 7, hollow: false });
  }
  columns.push(outs);
  label(n - 1, 'Out', String(OUTPUT_UNITS));

  let prev: { x: number; y: number; hollow?: boolean }[] = [
    { x: right + 2, y: CY - lastSize / 3 },
    { x: right + 2, y: CY },
    { x: right + 2, y: CY + lastSize / 3 },
  ];
  for (const pts of columns) {
    for (const a of prev) {
      for (const p of pts) {
        const accent = rnd() < 0.6;
        const w = [0.75, 1, 1, 1.5][Math.floor(rnd() * 4)];
        const o = a.hollow || p.hollow ? 0.12 : r1(0.25 + rnd() * 0.55);
        line(a.x, a.y, p.x, p.y, w, accent ? 'accent' : 'line', o);
      }
    }
    prev = pts;
  }

  return {
    lines,
    rects,
    dots: columns.flat().map((p) => ({ ...p, x: r1(p.x), y: r1(p.y) })),
    labels,
    sizeChain: arch.sizes.join(' → '),
  };
}

/** The diagram in words, for the aria-label. */
export function describeNetwork(settings: Settings): string {
  const { blocks, dense } = describeArchitecture(settings);
  const denseText = dense.length === 0 ? 'no hidden dense layers' : `${dense.length} hidden dense layer${dense.length === 1 ? '' : 's'} of ${settings.dense_units}`;
  return (
    `Network: input ${IMAGE_SIZE} by ${IMAGE_SIZE}, ${blocks.length} conv block${blocks.length === 1 ? '' : 's'} ` +
    `with ${settings.conv_layers_per_block} conv layer${settings.conv_layers_per_block === 1 ? '' : 's'} each, ` +
    `${denseText}, ${OUTPUT_UNITS} outputs`
  );
}
