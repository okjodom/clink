import { editRecoveryWord, validRecoveryWords } from "./recovery";

const phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about".split(" ");
const blank = () => Array<string>(12).fill("");

it("accepts only complete 12-word phrases with a valid checksum", () => {
  expect(validRecoveryWords(phrase)).toBe(true);
  expect(validRecoveryWords([...phrase.slice(0, 11), "abandon"])).toBe(false);
  expect(validRecoveryWords([...phrase.slice(0, 11), "notaword"])).toBe(false);
  expect(validRecoveryWords(phrase.slice(0, 11))).toBe(false);
  expect(validRecoveryWords(blank())).toBe(false);
  expect(validRecoveryWords([...Array<string>(23).fill("abandon"), "art"])).toBe(false);
});

it("advances only after a completed word, keeping ambiguous prefixes editable", () => {
  expect(editRecoveryWord(blank(), 0, "act")).toMatchObject({ next: null, error: null });
  expect(editRecoveryWord(blank(), 0, "ACT ")).toMatchObject({ next: 1, error: null });
  expect(editRecoveryWord(blank(), 0, "xyz ").next).toBeNull();
  expect(editRecoveryWord(blank(), 0, "").words[0]).toBe("");
});

it("distributes a pasted phrase with mixed case and whitespace in order", () => {
  const result = editRecoveryWord(blank(), 0, `  ${phrase.join("\n").toUpperCase()}  `);
  expect(result.words).toEqual(phrase);
  expect(result.next).toBe(11);
  expect(validRecoveryWords(result.words)).toBe(true);
});

it("supports correcting a word and pasting a few words without shifting the rest", () => {
  const single = editRecoveryWord(phrase, 5, "ability");
  expect(single.words[5]).toBe("ability");
  expect(single.words.slice(6)).toEqual(phrase.slice(6));
  const pasted = editRecoveryWord(phrase, 3, "legal winner");
  expect(pasted.words.slice(3, 5)).toEqual(["legal", "winner"]);
  expect(pasted.words.slice(5)).toEqual(phrase.slice(5));
  expect(pasted.next).toBe(5);
});

it("rejects overflowing pastes without silently truncating or changing any words", () => {
  for (const [index, value] of [[0, [...phrase, "ability"].join(" ")], [11, "legal winner"]] as const) {
    const result = editRecoveryWord(phrase, index, value);
    expect(result.words).toBe(phrase);
    expect(result.error).toMatch(/12 recovery words/);
  }
});
