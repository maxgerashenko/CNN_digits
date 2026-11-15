import { useNavigate } from 'react-router-dom';

import { GlassCard, LineChart, Mono, PillButton, type ChartLine } from '../../components/ui';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import type { CheckResult } from '../../lib/checks';
import { cx } from '../../lib/cx';
import { epochSeries, extent, idealCurve } from '../../lib/curves';
import { ROUTES } from '../../routes';
import { useSettingsStore } from '../../state/settingsStore';
import { explainCheck } from './explain';
import { GapBar } from './GapBar';
import styles from './ChangeFirstCard.module.css';

export interface ChangeFirstCardProps {
  check: CheckResult;
  /** 'full' = phone card with chart, paragraph and "Set" button. 'compact' = tablet column card. */
  variant?: 'full' | 'compact';
  className?: string;
}

function chartFor(check: CheckResult): { lines: ChartLine[]; xMax: number; y: [number, number] } | null {
  const { numbers } = check;
  const now = numbers ? numbers.nowSeries : check.series;
  const prev = numbers ? numbers.prevSeries : [];
  if (now.length < 2 && prev.length < 2) return null;
  const xMax = Math.max(now.length, prev.length, 2);
  const lines: ChartLine[] = [];
  const lists: number[][] = [now, prev];
  if (numbers && now.length > 0) {
    const ideal = idealCurve(xMax, now[0], numbers.ideal).map((p) => ({ x: 1 + p.x * ((xMax - 1) / xMax), y: p.y }));
    lines.push({ id: 'ideal', tone: 'ideal', points: ideal });
    lists.push([numbers.ideal]);
  }
  if (prev.length > 0) lines.push({ id: 'prev', tone: 'accent', points: epochSeries(prev) });
  if (now.length > 0) lines.push({ id: 'now', tone: 'now', points: epochSeries(now) });
  return { lines, xMax, y: extent(lists) };
}

/** One failed check that is worth changing first. */
export function ChangeFirstCard({ check, variant = 'full', className }: ChangeFirstCardProps) {
  const navigate = useNavigate();
  const mode = useLayoutMode();
  const applySettings = useSettingsStore((state) => state.applySettings);
  const { numbers } = check;
  const nowText = numbers?.nowText ?? check.lastText ?? '';
  const idealText = numbers?.idealText ?? check.idealShort;
  const prevText = numbers?.prevText ?? null;
  const closed = numbers?.gapClosed ?? null;

  if (variant === 'compact') {
    return (
      <GlassCard padding="row" className={cx(styles.compact, className)}>
        <div className={styles.compactHead}>
          <span className={styles.compactName}>{check.label}</span>
          <span className={styles.compactChange}>
            <span className={styles.muted}>{check.valueText}</span>
            {check.nextText && ` → ${check.nextText}`}
          </span>
        </div>
        <Mono>{check.metric}</Mono>
        <GapBar prevText={prevText} nowText={nowText} idealText={idealText} closed={closed} compact />
      </GlassCard>
    );
  }

  const chart = chartFor(check);
  const set = () => {
    if (check.next === null) return;
    applySettings({ [check.key]: check.next });
    if (mode === 'phone') navigate(ROUTES.train);
  };

  return (
    <GlassCard className={cx(styles.card, className)}>
      <div className={styles.head}>
        <div className={styles.title}>
          <h3 className={styles.name}>{check.label}</h3>
          <Mono>
            now {check.valueText} · checks {check.metric}
          </Mono>
        </div>
        {check.action && (
          <Mono tone="warn" className={styles.action}>
            {check.action}
          </Mono>
        )}
      </div>
      {chart && (
        <LineChart
          lines={chart.lines}
          xDomain={[1, chart.xMax]}
          yDomain={chart.y}
          height={54}
          baseline
          label={`${check.label}: ${check.metric}${prevText ? `, previous run ${prevText}` : ''}, this run ${nowText}, ideal ${idealText}`}
        />
      )}
      <GapBar prevText={prevText} nowText={nowText} idealText={idealText} closed={closed} />
      <p className={styles.text}>
        {check.evidence && (
          <Mono tone={check.evidence === 'measured' ? 'ok' : 'warn'}>
            {check.evidence === 'measured' ? 'MEASURED' : 'ESTIMATE'}
          </Mono>
        )}{' '}
        {explainCheck(check)}
      </p>
      {check.nextText && (
        <div className={styles.footer}>
          <span className={styles.next}>
            Next: <Mono size="button">{check.valueText}</Mono> → <Mono tone="text" size="button">{check.nextText}</Mono>
          </span>
          <PillButton variant="small" onClick={set}>
            Set {check.nextText}
          </PillButton>
        </div>
      )}
    </GlassCard>
  );
}
