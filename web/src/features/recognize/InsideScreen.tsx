import { Screen } from '../../components/shell';
import { EmptyState } from '../../components/ui';
import { ROUTES } from '../../routes';
import { AnswerBars } from './AnswerBars';
import { FeatureBlockSection } from './FeatureBlockSection';
import { InputSection } from './InputSection';
import { answerSpec, noModelText, stepLabel, useReading } from './reading';
import styles from './InsideScreen.module.css';

export interface InsideScreenProps {
  className?: string;
}

/** Phone screen and desktop pane: input, one section per conv block, the answer. */
export function InsideScreen({ className }: InsideScreenProps) {
  const { model, modelStatus, result } = useReading();
  const blocks = model?.info.blocks ?? [];

  return (
    <Screen
      title="How it was read"
      variant="pushed"
      backTo={ROUTES.recognize}
      backLabel="Back to drawing"
      gap={18}
      className={className}
    >
      <InputSection />
      {model ? (
        blocks.map((block) => (
          <FeatureBlockSection
            key={block.index}
            block={block}
            maps={result?.maps.find((m) => m.block === block.index) ?? null}
            step={stepLabel(block.index + 1)}
          />
        ))
      ) : (
        <EmptyState title="No model" className={styles.empty}>
          {noModelText(modelStatus)}
        </EmptyState>
      )}
      <section className={styles.answer} aria-label="Answer">
        <div className={styles.head}>
          <span className={styles.step}>{stepLabel(blocks.length + 2)} Answer</span>
          {model && <span className={styles.spec}>{answerSpec(model.info.flatten, model.info.dense)}</span>}
        </div>
        <h2 className={styles.title}>10 probabilities that add up to 100%</h2>
        <AnswerBars probs={result?.probs ?? null} />
        {model && !result && <p className={styles.note}>Draw a digit to see the probabilities.</p>}
      </section>
    </Screen>
  );
}
