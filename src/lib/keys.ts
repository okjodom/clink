/**
 * Every secret in the app comes from the one wallet phrase.
 *
 * Following the Minmo self-custodial identity research, Nostr keys are derived
 * with NIP-06 from the same BIP39 phrase that seeds the Breez Spark wallet
 * (Spark uses an unrelated derivation tree), so one backup restores funds,
 * identity and agent authority keys together.
 */
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { HDKey } from "@scure/bip32";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { getPublicKey } from "nostr-tools/pure";

export interface KeyPair {
  sk: Uint8Array;
  pk: string;
}

export interface KeyRing {
  /** Public identity: profile, agent definition, swap participant. */
  identity: KeyPair;
  /** Agent mode: publishes the escrow descriptor and core/secure|settle|refund. */
  escrow: KeyPair;
  /** Agent mode: bound as core/resolver for the agent's swaps. */
  resolver: KeyPair;
}

const ACCOUNT = { identity: 0, escrow: 1, resolver: 2 } as const;

export function newMnemonic(): string {
  return generateMnemonic(wordlist, 128);
}

export function normaliseMnemonic(input: string): string {
  return input.trim().toLowerCase().split(/\s+/).join(" ");
}

export function isValidMnemonic(input: string): boolean {
  return validateMnemonic(normaliseMnemonic(input), wordlist);
}

export function isMnemonicWord(word: string): boolean {
  return wordlist.includes(word.trim().toLowerCase());
}

export function mnemonicWordSuggestions(prefix: string, limit = 4): string[] {
  const p = prefix.trim().toLowerCase();
  if (!p) return [];
  return wordlist.filter((w) => w.startsWith(p)).slice(0, limit);
}

function account(root: HDKey, index: number): KeyPair {
  const sk = root.derive(`m/44'/1237'/${index}'/0/0`).privateKey;
  if (!sk) throw new Error("Could not derive identity key");
  return { sk, pk: getPublicKey(sk) };
}

export function deriveKeyRing(mnemonic: string): KeyRing {
  const m = normaliseMnemonic(mnemonic);
  // NIP-06 accounts share one BIP39 seed. PBKDF2 is deliberately expensive;
  // repeating it for each authority delays the first wallet frame on Hermes.
  const seed = mnemonicToSeedSync(m);
  const root = HDKey.fromMasterSeed(seed);
  try {
    return {
      identity: account(root, ACCOUNT.identity),
      escrow: account(root, ACCOUNT.escrow),
      resolver: account(root, ACCOUNT.resolver),
    };
  } finally {
    seed.fill(0);
    root.wipePrivateData();
  }
}

// -- HTLC secrets ------------------------------------------------------------

/**
 * Deterministic per-swap HTLC preimage. Deriving rather than storing it means
 * a reinstalled wallet can still release or recognise its own locks.
 */
export function htlcPreimage(identitySk: Uint8Array, coordinationId: string): string {
  return bytesToHex(hmac(sha256, identitySk, utf8ToBytes(`pontmore/spark-htlc/preimage/v1:${coordinationId}`)));
}

export function paymentHashOf(preimageHex: string): string {
  return bytesToHex(sha256(hexToBytes(preimageHex)));
}

// -- PIP-02 commitments ------------------------------------------------------

export interface Commitment {
  algorithm: "sha256-bytes@1";
  digest: string;
}

/** PIP-02 `sha256-bytes@1` over the exact UTF-8 bytes of `text`. */
export function commit(text: string): Commitment {
  return { algorithm: "sha256-bytes@1", digest: `sha256:${bytesToHex(sha256(utf8ToBytes(text)))}` };
}

export function verifyCommitment(text: string, c: unknown): boolean {
  if (!c || typeof c !== "object") return false;
  const { algorithm, digest } = c as Record<string, unknown>;
  return algorithm === "sha256-bytes@1" && digest === commit(text).digest;
}

export function sameCommitment(a: unknown, b: unknown): boolean {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  return x.algorithm === y.algorithm && typeof x.digest === "string" && x.digest === y.digest;
}

export { bytesToHex, hexToBytes };
