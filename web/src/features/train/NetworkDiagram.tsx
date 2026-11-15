import { cx } from '../../lib/cx';
import { countParams } from '../../lib/architecture';
import { formatInt } from '../../lib/format';
import type { Settings } from '../../types';
import { GlassCard } from '../../components/ui';
import {
  buildNetworkGeometry,
  describeNetwork,
  DIAGRAM_HEIGHT,
  DIAGRAM_WIDTH,
  type Tone,
} from './networkGeometry';
import styles from './NetworkDiagram.module.css';

export interface NetworkDiagramProps {
  className?: string;
  settings: Settings;
  sticky?: boolean;
  /**
   * The short version, for the card that stays at the top of the phone screen
   * once it is scrolled. The drawing and every value that follows the settings
   * stay; only the fixed names under the drawing fold away.
   */
  compact?: boolean;
}

const COLOR: Record<Tone, string> = {
  line: 'var(--color-line)',
  accent: 'var(--color-accent)',
  bg: 'var(--color-bg)',
  surface: 'var(--color-surface-1)',
  dim: 'var(--color-text-dim)',
};

/** The network the settings build, drawn as an SVG that scales with its container. */
export function NetworkDiagram({ className, settings, sticky = false, compact = false }: NetworkDiagramProps) {
  const geo = buildNetworkGeometry(settings);
  return (
    <GlassCard className={cx(styles.card, sticky && styles.sticky, compact && styles.compact, className)} padding="none">
      <div className={styles.viz} role="img" aria-label={describeNetwork(settings)}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          {geo.lines.map((l, i) => (
            <line
              key={`l${i}`}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={COLOR[l.tone]}
              strokeWidth={l.width}
              strokeOpacity={l.opacity}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {geo.rects.map((r, i) => (
            <rect
              key={`r${i}`}
              x={r.x}
              y={r.y}
              width={r.size}
              height={r.size}
              rx={r.radius}
              fill={COLOR[r.fill]}
              fillOpacity={r.fillOpacity}
              stroke={r.stroke ? COLOR[r.stroke] : 'none'}
              strokeWidth={1}
              strokeDasharray={r.dashed ? '3 2' : undefined}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {geo.dots.map((d, i) => (
            <circle
              key={`d${i}`}
              cx={d.x}
              cy={d.y}
              r={d.size / 2}
              fill={COLOR.bg}
              stroke={d.hollow ? COLOR.dim : COLOR.line}
              strokeWidth={1}
              strokeDasharray={d.hollow ? '2 2' : undefined}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <div className={styles.labels} aria-hidden="true">
          {geo.labels.map((t, i) => (
            <span
              key={i}
              className={styles.label}
              style={{ left: `${(t.center - t.width / 2) * 100}%`, width: `${t.width * 100}%` }}
            >
              <span className={styles.title}>{t.title}</span>
              <span className={styles.detail}>{t.detail}</span>
            </span>
          ))}
        </div>
      </div>
      <div className={styles.footer}>
        <span className={styles.params}>
          {formatInt(countParams(settings))} <span className={styles.unit}>weights</span>
        </span>
        <span className={styles.chain}>{geo.sizeChain}</span>
      </div>
    </GlassCard>
  );
}
