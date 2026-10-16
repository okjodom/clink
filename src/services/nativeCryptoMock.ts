/** Node-backed adapter for native AES-GCM integration tests. Never imported by the app. */
export const nativeCryptoMock = () => {
  const { Buffer } = require("node:buffer");
  const { createCipheriv, createDecipheriv, randomBytes } = require("node:crypto");
  return {
    AESEncryptionKey: { import: async (bytes: Uint8Array) => Buffer.from(bytes) },
    AESSealedData: { fromCombined: (value: Uint8Array) => {
      if (!(value instanceof Uint8Array)) throw new Error("Native fromCombined requires bytes");
      return Buffer.from(value);
    } },
    aesEncryptAsync: jest.fn(async (plaintext: Uint8Array, key: Uint8Array) => {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const sealed = Buffer.concat([iv, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
      return { combined: async () => sealed.toString("base64") };
    }),
    aesDecryptAsync: jest.fn(async (sealed: Uint8Array, key: Uint8Array) => {
      const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(0, 12));
      decipher.setAuthTag(sealed.subarray(-16));
      return new Uint8Array(Buffer.concat([decipher.update(sealed.subarray(12, -16)), decipher.final()]));
    }),
  };
};
