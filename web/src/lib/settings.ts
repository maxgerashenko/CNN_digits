// The 13 retraining settings: labels, hints, controls, choices and defaults.
// Ranges and defaults are the same as server/limits.py. Labels, hints, groups
// and the choice of control come from the design (artboard "2 Configure").

import type { SettingKey, SettingValue, Settings } from '../types';

export type SettingGroup = 'Layers' | 'Architecture' | 'Training' | 'Advanced';
export type SettingControl = 'stepper' | 'segmented' | 'slider' | 'switch';

export interface SettingSpec {
  key: SettingKey;
  label: string;
  /** One line under the label. */
  hint: string;
  group: SettingGroup;
  control: SettingControl;
  /** For 'segmented': the values to pick from, in order. */
  choices?: readonly number[];
  /** For 'stepper' and 'slider'. */
  min?: number;
  max?: number;
  step?: number;
  /** For 'slider': the value marked as optimal on the track while no run suggests another. */
  optimal?: number;
  default: SettingValue;
}

// Epochs, optimal 12: with the default settings a 20-epoch run stopped improving after epoch 12.
export const SETTING_SPECS: readonly SettingSpec[] = [
  { key: 'conv_blocks', label: 'Conv blocks', hint: 'Each block halves the image', group: 'Layers', control: 'stepper', min: 1, max: 3, step: 1, default: 2 },
  { key: 'conv_layers_per_block', label: 'Conv layers per block', hint: 'More layers, more complex patterns', group: 'Layers', control: 'stepper', min: 1, max: 3, step: 1, default: 2 },
  { key: 'dense_layers', label: 'Hidden dense layers', hint: '0 goes straight to the answer', group: 'Layers', control: 'stepper', min: 0, max: 2, step: 1, default: 1 },
  { key: 'filters', label: 'Filters in block 1', hint: 'Each next block doubles it', group: 'Architecture', control: 'segmented', choices: [4, 8, 16, 32], default: 16 },
  { key: 'kernel_size', label: 'Kernel size', hint: 'The window that slides over the image', group: 'Architecture', control: 'segmented', choices: [3, 5], default: 3 },
  { key: 'dense_units', label: 'Dense units', hint: 'Size of each hidden dense layer', group: 'Architecture', control: 'segmented', choices: [32, 64, 128, 256], default: 128 },
  { key: 'dropout', label: 'Dropout', hint: 'Higher fights overfitting', group: 'Architecture', control: 'slider', min: 0, max: 0.5, step: 0.1, default: 0.1 },
  { key: 'learning_rate', label: 'Learning rate', hint: 'Too high jumps around, too low is slow', group: 'Training', control: 'segmented', choices: [0.0001, 0.001, 0.01], default: 0.001 },
  { key: 'epochs', label: 'Epochs', hint: 'More passes, longer wait. Stops early when it stops improving', group: 'Training', control: 'slider', min: 1, max: 20, step: 1, optimal: 12, default: 2 },
  { key: 'batch_norm', label: 'Batch norm', hint: 'Off trains slower and less stable', group: 'Advanced', control: 'switch', default: true },
  { key: 'batch_size', label: 'Batch size', hint: 'Bigger is faster, sometimes less accurate', group: 'Advanced', control: 'segmented', choices: [32, 64, 128], default: 32 },
  { key: 'train_images', label: 'Training images', hint: 'More data, better model, longer wait', group: 'Advanced', control: 'segmented', choices: [5000, 10000, 30000, 60000], default: 10000 },
  { key: 'augmentation', label: 'Data augmentation', hint: 'Tilt and shift, helps on real drawings', group: 'Advanced', control: 'segmented', choices: [0, 0.05, 0.1], default: 0.05 },
];

export const SETTING_KEYS: readonly SettingKey[] = SETTING_SPECS.map((spec) => spec.key);

/** Group names in screen order. 'Advanced' sits behind the "Advanced settings" row on phone and desktop. */
export const SETTING_GROUPS: readonly SettingGroup[] = ['Layers', 'Architecture', 'Training', 'Advanced'];

export const DEFAULT_SETTINGS: Settings = Object.freeze(
  Object.fromEntries(SETTING_SPECS.map((spec) => [spec.key, spec.default])),
) as unknown as Settings;

const SPEC_BY_KEY = new Map(SETTING_SPECS.map((spec) => [spec.key, spec]));

export function getSettingSpec(key: SettingKey): SettingSpec {
  return SPEC_BY_KEY.get(key)!;
}

export function specsInGroup(group: SettingGroup): SettingSpec[] {
  return SETTING_SPECS.filter((spec) => spec.group === group);
}

/** How many settings sit in the Advanced group ("4 more"). */
export const ADVANCED_COUNT = specsInGroup('Advanced').length;

/**
 * A setting value as the design writes it.
 * 'long' is the phone form ("3 × 3"); 'short' is the tablet and list form ("3×3").
 */
export function formatSetting(key: SettingKey, value: SettingValue, form: 'long' | 'short' = 'short'): string {
  switch (key) {
    case 'kernel_size':
      return form === 'long' ? `${value} × ${value}` : `${value}×${value}`;
    case 'train_images':
      return `${Number(value) / 1000}k`;
    case 'augmentation':
      return Number(value) === 0 ? 'Off' : String(value);
    case 'batch_norm':
      return value ? 'on' : 'off';
    case 'dropout':
      return Number(value).toFixed(1);
    default:
      return String(value);
  }
}

function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

/** True when the value is allowed for this setting (same rules as the server). */
export function isAllowed(key: SettingKey, value: unknown): boolean {
  const spec = getSettingSpec(key);
  if (spec.control === 'switch') return typeof value === 'boolean';
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (spec.choices) return spec.choices.some((choice) => sameNumber(choice, value));
  if (value < spec.min! - 1e-9 || value > spec.max! + 1e-9) return false;
  return key === 'dropout' ? true : Number.isInteger(value);
}

/** Rounds away floating point noise from a slider (0.30000000000000004 becomes 0.3). */
export function cleanValue(key: SettingKey, value: SettingValue): SettingValue {
  if (typeof value === 'boolean') return value;
  const spec = getSettingSpec(key);
  if (spec.choices) return spec.choices.find((choice) => sameNumber(choice, value)) ?? value;
  if (key === 'dropout') return Math.round(value * 10) / 10;
  return Math.round(value);
}

/** The settings that differ between two runs, in screen order. */
export function diffSettings(a: Settings, b: Settings): SettingKey[] {
  return SETTING_KEYS.filter((key) => {
    const left = a[key];
    const right = b[key];
    if (typeof left === 'number' && typeof right === 'number') return !sameNumber(left, right);
    return left !== right;
  });
}
