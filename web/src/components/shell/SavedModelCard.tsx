import { SAVED_MODEL_FACTS } from '../../config';
import { formatAccuracy, formatInt } from '../../lib/format';
import { useModelStore } from '../../state/modelStore';
import { GlassCard } from '../ui/GlassCard';
import styles from './SavedModelCard.module.css';

/** The card at the bottom of the desktop rail: what the app model is, or why it is not there. */
export function SavedModelCard() {
  const saved = useModelStore((state) => state.saved);

  let lines: string[];
  if (saved.status === 'ready' && saved.model) {
    lines = [
      `${formatAccuracy(SAVED_MODEL_FACTS.testAccuracy)} · ${formatInt(SAVED_MODEL_FACTS.mistakes)} mistakes`,
      `${formatInt(saved.model.info.params)} weights`,
    ];
  } else if (saved.status === 'missing') {
    lines = ['Not added yet'];
  } else if (saved.status === 'error') {
    lines = ['Could not be loaded'];
  } else {
    lines = ['Loading'];
  }

  return (
    <GlassCard as="div" padding="none" className={styles.card}>
      <span className={styles.name}>App model</span>
      <span className={styles.facts}>
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </span>
    </GlassCard>
  );
}
