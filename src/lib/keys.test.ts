import { getPublicKey } from "nostr-tools/pure";
import { privateKeyFromSeedWords } from "nostr-tools/nip06";
import { deriveKeyRing } from "./keys";

it.each([
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  "legal winner thank year wave sausage worth useful legal winner thank yellow",
])("preserves every existing NIP-06 key when deriving the seed once", (phrase) => {
  const ring = deriveKeyRing(`  ${phrase.toUpperCase()}  `);
  for (const [index, role] of (["identity", "escrow", "resolver"] as const).entries()) {
    const previous = privateKeyFromSeedWords(phrase, undefined, index);
    expect(ring[role].sk).toEqual(previous);
    expect(ring[role].pk).toBe(getPublicKey(previous));
  }
});
