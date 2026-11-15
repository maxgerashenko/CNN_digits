import { SegmentedControl, Slider, Stepper, Switch } from '../../components/ui';
import { formatSetting, type SettingSpec } from '../../lib/settings';
import { useSettingsStore } from '../../state/settingsStore';
import type { SettingKey, SettingValue } from '../../types';

export interface SettingControlProps {
  spec: SettingSpec;
  size?: 'md' | 'sm';
  /** Shows the smallest and largest value at the ends of a slider. */
  showEnds?: boolean;
  /** A slider value to mark as optimal. */
  mark?: number;
}

/** The control named in the spec, wired to the settings store. */
export function SettingControl({ spec, size = 'md', showEnds = false, mark }: SettingControlProps) {
  const value = useSettingsStore((state) => state.settings[spec.key]) as SettingValue;
  const setSetting = useSettingsStore((state) => state.setSetting) as (key: SettingKey, value: SettingValue) => void;
  const set = (next: SettingValue) => setSetting(spec.key, next);

  switch (spec.control) {
    case 'stepper':
      return (
        <Stepper label={spec.label} value={Number(value)} min={spec.min!} max={spec.max!} step={spec.step} onChange={set} size={size} />
      );
    case 'segmented':
      return (
        <SegmentedControl<number>
          label={spec.label}
          options={spec.choices!.map((choice) => ({ value: choice, label: formatSetting(spec.key, choice) }))}
          value={Number(value)}
          onChange={set}
          size={size}
        />
      );
    case 'slider':
      return (
        <Slider
          label={spec.label}
          value={Number(value)}
          min={spec.min!}
          max={spec.max!}
          step={spec.step!}
          onChange={set}
          showEnds={showEnds}
          mark={mark}
          size={size}
        />
      );
    case 'switch':
      return <Switch label={spec.label} checked={Boolean(value)} onChange={set} size={size} />;
  }
}
