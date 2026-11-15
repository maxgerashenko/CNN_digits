// The icons of the design, as inline SVG. They take the text colour.

interface IconProps {
  className?: string;
}

/** The pen stroke of the Recognize tab. */
export function RecognizeIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 17c3-7 5-10 7-10s1 6 3 6 3-4 6-6" />
    </svg>
  );
}

/** The three sliders of the Train tab. */
export function TrainIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h9M19 7h1M4 12h2M12 12h8M4 17h10M20 17h0" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 1l6 6-6 6" />
    </svg>
  );
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" width="10" height="18" viewBox="0 0 10 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 1 1 9l8 8" />
    </svg>
  );
}

/** The bin of the "Clear drawing" button. */
export function TrashIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" />
    </svg>
  );
}
