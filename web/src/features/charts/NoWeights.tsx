import { EmptyState } from '../../components/ui';

/** The empty state of the two weight cards: the run holds no weights to draw. */
export function NoWeights() {
  return (
    <EmptyState surface="plain" title="Not measured">
      The weights of the trained model are not available, so there is nothing to draw yet. Finish a training run first.
    </EmptyState>
  );
}
