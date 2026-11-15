import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { PULL_RELOAD, usePullToReload } from './usePullToReload';
import { SWIPE_BACK_DISTANCE, SWIPE_FOLLOW_MAX, useSwipeBack } from './useSwipeBack';

const at = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] });

function SwipeBox() {
  const ref = useRef<HTMLDivElement>(null);
  useSwipeBack(ref, '/back');
  return (
    <div ref={ref} data-testid="box">
      <input type="range" aria-label="Dropout" />
      <span data-testid="where">{useLocation().pathname}</span>
    </div>
  );
}

function renderSwipe() {
  render(
    <MemoryRouter initialEntries={['/here']}>
      <SwipeBox />
    </MemoryRouter>,
  );
  return screen.getByTestId('box');
}

describe('useSwipeBack', () => {
  it('follows the finger up to 20px and goes back after more than 60px', () => {
    const box = renderSwipe();
    fireEvent.touchStart(box, at(10, 100));
    fireEvent.touchMove(box, at(40, 102));
    expect(box.style.transform).toBe('translateX(10px)');
    fireEvent.touchMove(box, at(10 + SWIPE_BACK_DISTANCE + 40, 104));
    expect(box.style.transform).toBe(`translateX(${SWIPE_FOLLOW_MAX}px)`);
    fireEvent.touchEnd(box);
    expect(box.style.transform).toBe('');
    expect(screen.getByTestId('where')).toHaveTextContent('/back');
  });

  it('springs back when released before 60px', () => {
    const box = renderSwipe();
    fireEvent.touchStart(box, at(10, 100));
    fireEvent.touchMove(box, at(10 + SWIPE_BACK_DISTANCE - 5, 100));
    fireEvent.touchEnd(box);
    expect(box.style.transform).toBe('');
    expect(screen.getByTestId('where')).toHaveTextContent('/here');
  });

  it('ignores a scroll and a drag that starts on a slider', () => {
    const box = renderSwipe();
    fireEvent.touchStart(box, at(10, 100));
    fireEvent.touchMove(box, at(20, 200));
    fireEvent.touchMove(box, at(200, 210));
    fireEvent.touchEnd(box);
    expect(screen.getByTestId('where')).toHaveTextContent('/here');

    const slider = screen.getByRole('slider', { name: 'Dropout' });
    fireEvent.touchStart(slider, at(10, 100));
    fireEvent.touchMove(slider, at(200, 100));
    fireEvent.touchEnd(slider);
    expect(screen.getByTestId('where')).toHaveTextContent('/here');
  });
});

function PullBox({ reload }: { reload: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const pull = usePullToReload(ref, true, reload);
  return (
    <div ref={ref} data-testid="box">
      <div data-no-pull data-testid="pad" />
      <output data-testid="state">{`${pull.height}|${pull.progress}|${pull.reloading}`}</output>
    </div>
  );
}

describe('usePullToReload', () => {
  it('opens with the pull and reloads when released after 64px', () => {
    const reload = vi.fn();
    render(<PullBox reload={reload} />);
    const box = screen.getByTestId('box');
    fireEvent.touchStart(box, at(100, 10));
    fireEvent.touchMove(box, at(100, 10 + 56));
    expect(screen.getByTestId('state')).toHaveTextContent('28|0.5|false');
    fireEvent.touchMove(box, at(100, 10 + 2 * PULL_RELOAD));
    fireEvent.touchEnd(box);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('state')).toHaveTextContent(`${PULL_RELOAD}|1|true`);
  });

  it('closes when released earlier, and never starts on the drawing pad or when scrolled', () => {
    const reload = vi.fn();
    render(<PullBox reload={reload} />);
    const box = screen.getByTestId('box');
    fireEvent.touchStart(box, at(100, 10));
    fireEvent.touchMove(box, at(100, 10 + 2 * PULL_RELOAD - 10));
    fireEvent.touchEnd(box);
    expect(screen.getByTestId('state')).toHaveTextContent('0|0|false');

    const pad = screen.getByTestId('pad');
    fireEvent.touchStart(pad, at(100, 10));
    fireEvent.touchMove(pad, at(100, 300));
    fireEvent.touchEnd(pad);

    box.scrollTop = 40;
    fireEvent.touchStart(box, at(100, 10));
    fireEvent.touchMove(box, at(100, 300));
    fireEvent.touchEnd(box);
    expect(reload).not.toHaveBeenCalled();
  });
});
