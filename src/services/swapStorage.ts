import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomBytes, bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64 } from "@scure/base";
import { decrypt } from "nostr-tools/nip44";
import { AESEncryptionKey, AESSealedData, aesEncryptAsync, aesDecryptAsync } from "expo-crypto";
import type { StateStorage } from "zustand/middleware";

import { getSecret, setSecret } from "./secure";

const KEY = "swaps.cache-key.v1";
const LEGACY_PREFIX = "encrypted-v1:";
const PREFIX = "encrypted-v2:";
let queue: Promise<unknown> = Promise.resolve();

// Serialize key creation, migration and writes so an older snapshot cannot win.
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work);
  queue = next.catch(() => undefined);
  return next;
}

async function key(): Promise<Uint8Array> {
  const stored = await getSecret(KEY);
  if (stored !== null) {
    if (!/^[0-9a-f]{64}$/.test(stored)) throw new Error("Invalid swap cache key");
    return hexToBytes(stored);
  }
  const fresh = randomBytes(32);
  await setSecret(KEY, bytesToHex(fresh));
  return fresh;
}

async function seal(name: string, value: string): Promise<string> {
  const nativeKey = await aesKey(await key());
  const sealed = await aesEncryptAsync(utf8ToBytes(JSON.stringify({ name, value })), nativeKey, { nonce: { length: 12 }, tagLength: 16 });
  return PREFIX + await sealed.combined("base64");
}

/** Separate the native AES key from the old NIP-44 cache key. */
async function aesKey(bytes: Uint8Array): Promise<AESEncryptionKey> {
  const derived = hkdf(sha256, bytes, undefined, utf8ToBytes("clink.cache.aes-gcm.v2"), 32);
  try { return await AESEncryptionKey.import(derived); }
  finally { derived.fill(0); }
}

export const encryptedSwapStorage: StateStorage = {
  getItem: (name) => serialized(async () => {
    const value = await AsyncStorage.getItem(name);
    if (value === null) return null;
    if (!value.startsWith(PREFIX) && !value.startsWith(LEGACY_PREFIX)) {
      if (await getSecret(KEY)) throw new Error("Refusing plaintext downgrade of the swap cache");
      // Upgrade in place before exposing any legacy plaintext to the store.
      JSON.parse(value);
      await AsyncStorage.setItem(name, await seal(name, value));
      return value;
    }
    const storedKey = await getSecret(KEY);
    if (!storedKey) throw new Error("Swap cache key is unavailable");
    if (!/^[0-9a-f]{64}$/.test(storedKey)) throw new Error("Invalid swap cache key");
    const legacy = value.startsWith(LEGACY_PREFIX);
    const plaintext = legacy
      ? decrypt(value.slice(LEGACY_PREFIX.length), hexToBytes(storedKey))
      : new TextDecoder().decode(await aesDecryptAsync(AESSealedData.fromCombined(base64.decode(value.slice(PREFIX.length))), await aesKey(hexToBytes(storedKey))));
    const opened = JSON.parse(plaintext);
    if (opened.name !== name || typeof opened.value !== "string") throw new Error("Invalid swap cache envelope");
    // One-time authenticated migration; native encryption avoids JS-thread stalls.
    if (legacy) await AsyncStorage.setItem(name, await seal(name, opened.value));
    return opened.value;
  }),
  setItem: (name, value) => serialized(async () => {
    await AsyncStorage.setItem(name, await seal(name, value));
  }),
  removeItem: (name) => serialized(() => AsyncStorage.removeItem(name)),
};
