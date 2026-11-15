import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { SETTING_SPECS } from '../../lib/settings';
import { useSettingsStore } from '../../state/settingsStore';
import { useTrainingStore } from '../../state/trainingStore';
import { resetStores } from '../../test/utils';
import { sampleRuns } from '../../test/fixtures';
import { SettingsGrid } from './SettingsGrid';
import { SettingsPanel } from './SettingsPanel';

beforeEach(() => resetStores());

describe('SettingsPanel', () => {
  it('hides the Advanced group behind its row', () => {
    render(<SettingsPanel />);
    expect(screen.queryByText('Batch size')).toBeNull();
    const toggle = screen.getByRole('button', { name: /Advanced settings/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('4 more');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toContain('Hide');
    expect(screen.getByText('Batch size')).toBeTruthy();
  });

  it('shows all 13 rows once open, each with a check strip marked new before a run', () => {
    useSettingsStore.getState().setAdvancedOpen(true);
    const { container } = render(<SettingsPanel />);
    expect(container.querySelectorAll('[data-setting]').length).toBe(SETTING_SPECS.length);
    expect(container.querySelectorAll('[data-status="new"]').length).toBe(13);
    expect(screen.getAllByText('new').length).toBe(13);
    expect(container.textContent).not.toContain('last ');
  });

  it('writes to the settings store', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Epochs: more' }));
    expect(useSettingsStore.getState().settings.epochs).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: '5×5' }));
    expect(useSettingsStore.getState().settings.kernel_size).toBe(5);
    fireEvent.change(screen.getByRole('slider', { name: 'Dropout' }), { target: { value: '0.3' } });
    expect(useSettingsStore.getState().settings.dropout).toBe(0.3);
  });

  it('cannot step past the limits', () => {
    render(<SettingsPanel />);
    const less = screen.getByRole('button', { name: 'Conv blocks: less' });
    fireEvent.click(less);
    fireEvent.click(less);
    expect(useSettingsStore.getState().settings.conv_blocks).toBe(1);
    expect((less as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows ideal and last after a run', () => {
    useTrainingStore.setState({ runs: sampleRuns });
    const { container } = render(<SettingsPanel />);
    expect(container.textContent).toContain('last ');
    expect(container.querySelectorAll('[data-status="new"]').length).toBe(0);
    const row = container.querySelector('[data-setting="epochs"]') as HTMLElement;
    expect(within(row).getByText(/Checks/)).toBeTruthy();
  });
});

describe('SettingsGrid', () => {
  it('shows all 13 settings in the four groups with a verdict word each', () => {
    const { container } = render(<SettingsGrid />);
    expect(container.querySelectorAll('[data-setting]').length).toBe(13);
    for (const name of ['Layers', 'Architecture', 'Training', 'Advanced']) {
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    }
    expect(screen.getAllByText('new').length).toBe(13);
  });

  it('uses the verdict words of a run', () => {
    useTrainingStore.setState({ runs: sampleRuns });
    render(<SettingsGrid />);
    const words = new Set(['keep', 'later', 'raise', 'lower', 'switch', 'not measured']);
    const found = screen.queryAllByText((text, el) => el?.tagName === 'SPAN' && words.has(text));
    expect(found.length).toBeGreaterThan(0);
  });

  it('writes to the store', () => {
    render(<SettingsGrid />);
    fireEvent.click(screen.getByRole('button', { name: '30k' }));
    expect(useSettingsStore.getState().settings.train_images).toBe(30000);
    fireEvent.click(screen.getByRole('switch', { name: 'Batch norm' }));
    expect(useSettingsStore.getState().settings.batch_norm).toBe(false);
  });
});
