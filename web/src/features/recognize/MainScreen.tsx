import { useState } from 'react';

import { Screen } from '../../components/shell';
import { EmptyState, PillButton } from '../../components/ui';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { useInPane } from '../../hooks/usePane';
import { cx } from '../../lib/cx';
import { formatInt } from '../../lib/format';
import { ROUTES } from '../../routes';
import { DrawingPad } from './DrawingPad';
import { FeatureBlockSection } from './FeatureBlockSection';
import { ModelPills } from './ModelPills';
import { ResultCard } from './ResultCard';
import { noModelText, stepLabel, useReading } from './reading';
import styles from './MainScreen.module.css';

export interface MainScreenProps {
  className?: string;
}

/** The Result card turns small after the screen is scrolled this far, in px. */
export const SHRINK_AFTER = 48;
/** It turns large again when the screen is scrolled back above this, in px. */
export const GROW_BEFORE = 36;

/**
 * Recognize: pick a model, draw a digit, read the answer.
 *
 * On a phone the model choice, the pad and the Result card stay at the top.
 * "How it was read" scrolls under them, and the Result card turns small to
 * make room. The Train button is at the bottom while the screen is at its top.
 */
export function MainScreen({ className }: MainScreenProps) {
  const inPane = useInPane();
  const phone = useLayoutMode() === 'phone' && !inPane;
  const [scrolled, setScrolled] = useState(false);

  if (!phone) {
    return (
      <Screen title="CNN Digit AI" variant="root" className={className}>
        <ModelPills />
        <DrawingPad />
        <ResultCard variant="bars" />
      </Screen>
    );
  }

  return (
    <Screen
      title="CNN Digit AI"
      variant="root"
      className={cx(styles.screen, className)}
      snap
      pullToReload
      onScrollTop={(top) => setScrolled((was) => (was ? top >= GROW_BEFORE : top > SHRINK_AFTER))}
      pinnedClassName={styles.pinned}
      pinned={
        <>
          <ModelPills />
          <DrawingPad className={styles.pad} />
          <ResultCard variant="bars" size={scrolled ? 'small' : 'large'} />
        </>
      }
      footerHidden={scrolled}
      footerOverlay
      footer={
        <>
          <PillButton to={ROUTES.train}>Train</PillButton>
          <p className={styles.note}>Get your own model for recognition.</p>
        </>
      }
    >
      <HowItWasRead />
    </Screen>
  );
}

/** The conv blocks of the active model, one panel each. */
function HowItWasRead() {
  const { model, modelStatus, result } = useReading();
  const blocks = model?.info.blocks ?? [];
  return (
    <>
      <div className={styles.intro}>
        <h2 className={styles.heading}>How it was read</h2>
        {model && (
          <p className={styles.summary}>
            784 numbers in, {blocks.map((block) => formatInt(block.filters)).join(' then ')} filters, 10 probabilities out.
          </p>
        )}
      </div>
      {model ? (
        blocks.map((block, i) => (
          // The last panel gets room below it, so the end of the scroll is its snap point.
          <div key={block.index} className={i === blocks.length - 1 ? styles.last : undefined}>
            <FeatureBlockSection
              block={block}
              maps={result?.maps.find((m) => m.block === block.index) ?? null}
              step={stepLabel(block.index)}
              variant="panel"
              className={styles.panel}
            />
          </div>
        ))
      ) : (
        <EmptyState title="No model">{noModelText(modelStatus)}</EmptyState>
      )}
    </>
  );
}
