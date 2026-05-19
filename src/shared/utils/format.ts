/** "th" / "st" / "nd" / "rd" suffix for a positive integer rank. */
export function ordinalSuffix(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  switch (n % 10) {
    case 1:  return 'st';
    case 2:  return 'nd';
    case 3:  return 'rd';
    default: return 'th';
  }
}

/** Full ordinal — "4th", "21st", "12th". */
export function ordinal(n: number): string {
  return `${n}${ordinalSuffix(n)}`;
}
