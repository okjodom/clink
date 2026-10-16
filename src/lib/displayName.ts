/** Display names use sentence case; payment usernames are handled separately. */
export function sentenceCaseName(name: string): string {
  return name.trim().toLowerCase().replace(/\p{L}/u, (letter) => letter.toUpperCase());
}
