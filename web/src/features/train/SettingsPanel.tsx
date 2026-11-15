import { ListCard, SectionHeading } from '../../components/ui';
import { cx } from '../../lib/cx';
import { SETTING_GROUPS, specsInGroup, type SettingGroup } from '../../lib/settings';
import { useRunChecks } from '../../hooks/useRunChecks';
import { SettingRow } from './SettingRow';
import styles from './SettingsPanel.module.css';

export interface SettingsPanelProps {
  className?: string;
}

/** The setting groups of the phone and pane forms. Advanced is the last group. */
export function SettingsPanel({ className }: SettingsPanelProps) {
  const { checks } = useRunChecks();
  const checkOf = (key: string) => checks.find((check) => check.key === key)!;

  const group = (name: SettingGroup) => (
    <section key={name} className={styles.group} aria-label={name}>
      <SectionHeading>{name}</SectionHeading>
      <ListCard>
        {specsInGroup(name).map((spec) => (
          <SettingRow key={spec.key} spec={spec} check={checkOf(spec.key)} />
        ))}
      </ListCard>
    </section>
  );

  return (
    <div className={cx(styles.panel, className)}>
      {SETTING_GROUPS.filter((name) => name !== 'Advanced').map(group)}
      {group('Advanced')}
    </div>
  );
}
