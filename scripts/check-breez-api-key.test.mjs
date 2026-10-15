import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkBreezApiKey } from "./check-breez-api-key.mjs";

// Public, self-signed test certificate; no private key or Breez credential.
const cert = new X509Certificate(readFileSync(new URL("./fixtures/api-key-test-cert.pem", import.meta.url)));
const key = cert.raw.toString("base64");
const validTime = Date.parse(cert.validFrom) + 1000;

test("accepts a complete, currently valid certificate", () => {
  checkBreezApiKey(key, validTime);
});

test("rejects the truncated-certificate failure seen in the release", () => {
  const truncated = cert.raw.subarray(0, Math.floor(cert.raw.length / 2)).toString("base64");
  assert.throws(() => checkBreezApiKey(truncated, validTime), /malformed or truncated/);
  for (const bad of [undefined, "", "not-a-key", ` ${key}`, `${key}\n`, `${key}extra`]) {
    assert.throws(() => checkBreezApiKey(bad, validTime));
  }
});

test("rejects certificates outside their validity dates without exposing the key", () => {
  for (const now of [Date.parse(cert.validFrom) - 1, Date.parse(cert.validTo)]) {
    assert.throws(() => checkBreezApiKey(key, now), (error) => /expired or not yet valid/.test(error.message) && !error.message.includes(key));
  }
});
