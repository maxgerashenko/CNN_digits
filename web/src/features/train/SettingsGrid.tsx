import { Fragment } from 'react';

import { GlassCard, Mono, SectionHeading, type Tone } from '../../components/ui';
import { useRunChecks } from '../../hooks/useRunChecks';
import { BUCKET_WORD, STATUS_WORD, type CheckResult } from '../../lib/checks';
import { cx } from '../../lib/cx';
import { formatSetting, specsInGroup, type SettingSpec } from '../../lib/settings';
import { useSettingsStore } from '../../state/settingsStore';
import { SettingControl } from './SettingControl';
import styles from './SettingsGrid.module.css';

export interface SettingsGridProps {
  className?: string;
}

/** Two columns of groups, in the order of the design. */
const COLUMNS = [['Layers', 'Architecture'], ['Training', 'Advanced']] as const;

function verdictOf(check: CheckResult): { word: string; tone: Tone } {
  switch (check.status) {
    case 'ok':
      return { word: BUCKET_WORD.keep.text, tone: BUCKET_WORD.keep.tone };
    case 'improve':
      return {
        word: check.bucket === 'later' ? BUCKET_WORD.later.text : (check.action ?? BUCKET_WORD.later.text),
        tone: BUCKET_WORD.later.tone,
      };
    default:
      return { word: STATUS_WORD[check.status].text, tone: STATUS_WORD[check.status].tone };
  }
}

function GridRow({ spec, check }: { spec: SettingSpec; check: CheckResult }) {
  const { word, tone } = verdictOf(check);
  const value = useSettingsStore((state) => state.settings[spec.key]);
  return (
    <div className={styles.row} data-setting={spec.key}>
      <div className={styles.line}>
        <span className={styles.label}>
          <span aria-hidden="true" className={cx(styles.dot, styles[`dot-${tone}`])} />
          {spec.label}
        </span>
        <Mono tone={tone} size="label">
          {word}
        </Mono>
      </div>
      {spec.control === 'slider' ? (
        <div className={styles.valueRow}>
          <div className={styles.valueControl}>
            <SettingControl spec={spec} size="sm" />
          </div>
          <Mono tone="accent" size="small" className={styles.value}>
            {formatSetting(spec.key, value)}
          </Mono>
        </div>
      ) : spec.control === 'switch' ? (
        <div className={styles.valueRow}>
          <Mono size="hint">{value ? 'on' : 'off'}</Mono>
          <SettingControl spec={spec} size="sm" />
        </div>
      ) : (
        <SettingControl spec={spec} size="sm" />
      )}
    </div>
  );
}

/** All 13 settings for the tablet: two columns, dense controls, a dot and a verdict word each. */
export function SettingsGrid({ className }: SettingsGridProps) {
  const { checks } = useRunChecks();
  return (
    <GlassCard aria-label="Settings" padding="none" className={cx(styles.grid, className)}>
      {COLUMNS.map((names, index) => (
        <div key={index} className={styles.column}>
          {names.map((name) => (
            <Fragment key={name}>
              <SectionHeading tone="accent" inset={false}>
                {name}
              </SectionHeading>
              {specsInGroup(name).map((spec) => (
                <GridRow key={spec.key} spec={spec} check={checks.find((c) => c.key === spec.key)!} />
              ))}
            </Fragment>
          ))}
        </div>
      ))}
    </GlassCard>
  );
}

