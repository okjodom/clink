import { isMnemonicWord, isValidMnemonic } from "./keys";

export const RECOVERY_WORD_COUNT = 12;

export function validRecoveryWords(words: string[]): boolean {
  return words.length === RECOVERY_WORD_COUNT && words.every((word) => !!word && isMnemonicWord(word)) && isValidMnemonic(words.join(" "));
}

/** Distribute pasted words without dropping or replacing words outside the edit. */
export function editRecoveryWord(words: string[], index: number, value: string): { words: string[]; next: number | null; error: string | null } {
  const clean = value.toLowerCase().trim();
  const parts = clean ? clean.split(/\s+/) : [""];
  if (index < 0 || index >= RECOVERY_WORD_COUNT || parts.length + index > RECOVERY_WORD_COUNT) {
    return { words, next: null, error: "Use your 12 recovery words. Nothing was changed." };
  }
  const next = [...words];
  parts.forEach((word, offset) => { next[index + offset] = word; });
  const advance = parts.length > 1 || (/\s$/.test(value) && isMnemonicWord(clean));
  return { words: next, next: advance ? Math.min(index + parts.length, RECOVERY_WORD_COUNT - 1) : null, error: null };
}
