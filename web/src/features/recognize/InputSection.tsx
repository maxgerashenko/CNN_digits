import { PixelGrid } from '../../components/ui';
import { useDrawingStore } from '../../state/drawingStore';
import styles from './InputSection.module.css';

/** Step 01 on the phone and in a pane: the drawing as the 28 x 28 numbers the network gets. */
export function InputSection() {
  const pixels = useDrawingStore((s) => s.pixels);
  const blank = useDrawingStore((s) => s.blank);
  return (
    <section className={styles.section} aria-label="Input">
      <div className={styles.picture}>
        <PixelGrid data={blank ? null : pixels} size={28} ramp="ink" label="Your drawing as 28 by 28 cells" />
      </div>
      <div className={styles.text}>
        <span className={styles.step}>01 Input</span>
        <h2 className={styles.title}>Your drawing, 28 × 28</h2>
        <p className={styles.note}>Each cell becomes one number from 0 to 1: how much ink it holds. 784 numbers go in.</p>
      </div>
    </section>
  );
}
