import { ListRow } from '../../components/ui';
import { Mono } from '../../components/ui';
import type { CheckResult } from '../../lib/checks';
import { formatSetting, type SettingSpec } from '../../lib/settings';
import { useSettingsStore } from '../../state/settingsStore';
import { CheckStrip } from './CheckStrip';
import { SettingControl } from './SettingControl';
import styles from './SettingRow.module.css';

export interface SettingRowProps {
  spec: SettingSpec;
  check: CheckResult;
}

/** One setting on the phone and in a pane: label, hint, control, then the check strip. */
export function SettingRow({ spec, check }: SettingRowProps) {
  const value = useSettingsStore((state) => state.settings[spec.key]);
  const inline = spec.control === 'stepper' || spec.control === 'switch';
  return (
    <ListRow layout="stack" className={styles.row} data-setting={spec.key}>
      <div className={styles.top}>
        <div className={styles.names}>
          <span className={styles.label}>{spec.label}</span>
          <span className={styles.hint}>{spec.hint}</span>
        </div>
        {inline && <SettingControl spec={spec} />}
        {spec.control === 'slider' && (
          <Mono tone="accent" size="button" className={styles.value}>
            {formatSetting(spec.key, value)}
          </Mono>
        )}
      </div>
      {spec.control === 'segmented' && <SettingControl spec={spec} />}
      {spec.control === 'slider' && <SettingControl spec={spec} showEnds mark={spec.optimal} />}
      <CheckStrip check={check} />
    </ListRow>
  );
}
