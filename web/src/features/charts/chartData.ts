// Numbers for the charts that are worked out from what the server measured.

export interface DigitAccuracy {
  digit: number;
  /** Share of the test images of this digit that were read correctly, 0..1. */
  accuracy: number;
  /** Test images of this digit. */
  total: number;
}

/** Accuracy of each digit from the confusion table (row = drawn, column = read). */
export function perDigitAccuracy(confusion: number[][]): DigitAccuracy[] {
  return confusion.map((row, digit) => {
    const total = row.reduce((sum, count) => sum + count, 0);
    return { digit, accuracy: total > 0 ? row[digit] / total : 0, total };
  });
}

export interface Confusion {
  drawn: number;
  readAs: number;
  count: number;
}

/** The pairs the network mixes up most often, largest first. Pairs with no mistakes are left out. */
export function topConfusions(confusion: number[][], limit = 3): Confusion[] {
  const pairs: Confusion[] = [];
  confusion.forEach((row, drawn) =>
    row.forEach((count, readAs) => {
      if (drawn !== readAs && count > 0) pairs.push({ drawn, readAs, count });
    }),
  );
  return pairs.sort((a, b) => b.count - a.count || a.drawn - b.drawn || a.readAs - b.readAs).slice(0, limit);
}

/** The largest count outside the diagonal. */
export function largestMistake(confusion: number[][]): number {
  let largest = 0;
  confusion.forEach((row, drawn) =>
    row.forEach((count, readAs) => {
      if (drawn !== readAs) largest = Math.max(largest, count);
    }),
  );
  return largest;
}

/** List the digits as "9", "9 and 4", "9, 4 and 3". */
export function listDigits(digits: number[]): string {
  if (digits.length <= 1) return digits.join('');
  return `${digits.slice(0, -1).join(', ')} and ${digits[digits.length - 1]}`;
}
