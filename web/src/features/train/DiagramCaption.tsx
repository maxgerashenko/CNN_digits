import { cx } from '../../lib/cx';
import styles from './DiagramCaption.module.css';

export interface DiagramCaptionProps {
  className?: string;
}

/** The legend under the network diagram. */
export function DiagramCaption({ className }: DiagramCaptionProps) {
  return (
    <p className={cx(styles.caption, className)}>
      Small squares above a block are its conv layers. The box inside Input is the kernel. Dashed dots are switched off
      by dropout.
    </p>
  );
}
