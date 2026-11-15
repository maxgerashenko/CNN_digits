import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { SegmentedControl } from './SegmentedControl';
import { Slider } from './Slider';
import { Stepper } from './Stepper';
import { Switch } from './Switch';

describe('Stepper', () => {
  function Harness({ start = 4 }: { start?: number }) {
    const [value, setValue] = useState(start);
    return <Stepper label="Epochs" value={value} min={1} max={5} onChange={setValue} />;
  }

  it('changes by click and has names', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Epochs' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Epochs: more' }));
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Epochs: more' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Epochs: less' }));
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('changes by keyboard', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByText('3')).toBeInTheDocument();
    await user.tab();
    await user.keyboard(' ');
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('stops at the limits', async () => {
    const user = userEvent.setup();
    render(<Harness start={1} />);
    expect(screen.getByRole('button', { name: 'Epochs: less' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Epochs: less' }));
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});

describe('SegmentedControl', () => {
  function Harness() {
    const [value, setValue] = useState(3);
    return (
      <SegmentedControl<number>
        label="Kernel size"
        options={[
          { value: 3, label: '3×3' },
          { value: 5, label: '5×5' },
        ]}
        value={value}
        onChange={setValue}
      />
    );
  }

  it('selects by click', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Kernel size' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3×3' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '5×5' }));
    expect(screen.getByRole('button', { name: '5×5' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '3×3' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('selects by keyboard', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: '5×5' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Switch', () => {
  function Harness() {
    const [on, setOn] = useState(false);
    return <Switch label="Batch norm" checked={on} onChange={setOn} />;
  }

  it('toggles by click and by keyboard', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const control = screen.getByRole('switch', { name: 'Batch norm' });
    expect(control).toHaveAttribute('aria-checked', 'false');
    await user.click(control);
    expect(control).toHaveAttribute('aria-checked', 'true');
    expect(control).toHaveFocus();
    await user.keyboard(' ');
    expect(control).toHaveAttribute('aria-checked', 'false');
    await user.keyboard('{Enter}');
    expect(control).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Slider', () => {
  function Harness() {
    const [value, setValue] = useState(0.3);
    return <Slider label="Dropout" value={value} min={0} max={0.5} step={0.1} onChange={setValue} />;
  }

  it('has a name, is reachable by Tab and follows input events', async () => {
    // jsdom does not move a range input with arrow keys (a browser does), so
    // the change comes in as the input event the browser would send.
    const user = userEvent.setup();
    render(<Harness />);
    const slider = screen.getByRole('slider', { name: 'Dropout' });
    expect(slider).toHaveValue('0.3');
    await user.tab();
    expect(slider).toHaveFocus();
    fireEvent.change(slider, { target: { value: '0.4' } });
    expect(slider).toHaveValue('0.4');
  });
});
