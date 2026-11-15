import { screen } from '@testing-library/react';
import { act } from 'react';

import { runOne, runTwo } from '../../test/fixtures';
import { renderApp, resetStores } from '../../test/utils';
import { useTrainingStore } from '../../state/trainingStore';

beforeEach(() => resetStores());

describe('ChartsScreen', () => {
  it('shows one empty state without runs', () => {
    renderApp({ route: '/train/charts' });
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    expect(screen.queryByText('Accuracy, train vs validation')).not.toBeInTheDocument();
    expect(screen.queryByText('train')).not.toBeInTheDocument();
  });

  it('has a back link to run details', () => {
    renderApp({ route: '/train/charts' });
    expect(screen.getByRole('link', { name: 'Back to run details' })).toHaveAttribute('href', '/train/details');
  });

  it('shows KPI strip, legend and curve cards for the latest run', () => {
    act(() => useTrainingStore.setState({ runs: [runOne, runTwo] }));
    renderApp({ route: '/train/charts' });
    expect(screen.queryByText('No runs yet')).not.toBeInTheDocument();
    // KPI cells of run 2 (98.62%, 138 mistakes, 114 s / 4 epochs, lr 0.001)
    expect(screen.getByText('val acc').nextSibling).toHaveTextContent('98.6%');
    expect(screen.getByText('mistakes').nextSibling).toHaveTextContent('138');
    expect(screen.getByText('s / epoch').nextSibling).toHaveTextContent('29');
    expect(screen.getByText('lr').nextSibling).toHaveTextContent('0.001');
    expect(screen.getByText('validation')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Accuracy, train vs validation' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Loss, train vs validation' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Accuracy, train vs validation: train 98\.3%, validation 98\.6%/ })).toBeInTheDocument();
    expect(screen.getByText(/Here: train 98\.3%, validation 98\.6%, goal 99\.53%/)).toBeInTheDocument();
  });

  it('works with a one-epoch run', () => {
    const one = { ...runOne, epochs: runOne.epochs.slice(0, 1) };
    act(() => useTrainingStore.setState({ runs: [one] }));
    renderApp({ route: '/train/charts' });
    expect(screen.getByRole('heading', { name: 'Loss, train vs validation' })).toBeInTheDocument();
  });

  it('places the cards in the artboard order', () => {
    act(() => useTrainingStore.setState({ runs: [runOne] }));
    const { container } = renderApp({ route: '/train/charts' });
    const headings = [...container.querySelectorAll('h2')].map((h) => h.textContent);
    expect(headings.slice(0, 2)).toEqual(['Accuracy, train vs validation', 'Loss, train vs validation']);
  });
});
