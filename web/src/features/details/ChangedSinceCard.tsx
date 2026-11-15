import { GlassCard, Mono } from '../../components/ui';
import { useRunChecks } from '../../hooks/useRunChecks';
import { cx } from '../../lib/cx';
import { formatSetting, getSettingSpec } from '../../lib/settings';
import styles from './ChangedSinceCard.module.css';

export interface ChangedSinceCardProps {
  className?: string;
}

/** What differs between the last two runs. Shows nothing without two runs. */
export function ChangedSinceCard({ className }: ChangedSinceCardProps) {
  const { run, prev, changed } = useRunChecks();
  if (!run || !prev) return null;

  return (
    <GlassCard className={cx(styles.card, className)}>
      <Mono>{`Changed since run ${prev.number}`}</Mono>
      {changed.length === 0 ? (
        <>
          <p className={styles.line}>No setting changed</p>
          <p className={styles.note}>
            Both runs used the same settings, so any difference between them comes from chance in training.
          </p>
        </>
      ) : (
        <>
          {changed.map((key) => (
            <p key={key} className={styles.line}>
              {getSettingSpec(key).label}{' '}
              <span className={styles.old}>{formatSetting(key, prev.settings[key])}</span>
              {' → '}
              <span className={styles.new}>{formatSetting(key, run.settings[key])}</span>
            </p>
          ))}
          <p className={styles.note}>
            {changed.length === 1
              ? 'Only one setting changed, so the whole difference between the runs belongs to it.'
              : 'Several settings changed, so the difference between the runs cannot be split between them.'}
          </p>
        </>
      )}
    </GlassCard>
  );
}
