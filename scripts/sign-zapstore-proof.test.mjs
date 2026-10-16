import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { generateSecretKey, getPublicKey, nip19, verifyEvent } from "nostr-tools";
import { signProof } from "./sign-zapstore-proof.mjs";

for (const format of ["PKCS12", "JKS"]) {
  test(`pinned CLI signs ${format} content with an Android .keystore filename`, { skip: !process.env.ZSP_BIN }, () => {
    const dir = mkdtempSync(join(tmpdir(), "clink-proof-test-"));
    const key = generateSecretKey();
    const previous = { SIGN_WITH: process.env.SIGN_WITH, KEYSTORE_PASSWORD: process.env.KEYSTORE_PASSWORD };
    try {
      const path = join(dir, "upload.keystore");
      const password = "temporary-test-password";
      const generated = spawnSync("keytool", ["-genkeypair", "-alias", "clink", "-keyalg", "RSA", "-keysize", "2048", "-validity", "1", "-dname", "CN=Clink-Test", "-storetype", format, "-keystore", path, "-storepass", password, "-keypass", password], { encoding: "utf8" });
      assert.equal(generated.status, 0, generated.stderr);
      process.env.SIGN_WITH = nip19.nsecEncode(key);
      process.env.KEYSTORE_PASSWORD = password;
      const output = join(dir, "proof.json");
      const proof = signProof(process.env.ZSP_BIN, path, output);
      assert.equal(proof.pubkey, getPublicKey(key));
      assert.equal(proof.kind, 30509);
      assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), proof);
      assert.ok(verifyEvent(proof), "CLI must return a valid signed Nostr event");
      assert.ok(readFileSync(path).length > 0, "The original signing keystore must be preserved");
      process.env.KEYSTORE_PASSWORD = "wrong-password";
      assert.throws(() => signProof(process.env.ZSP_BIN, path, output), /proof signing failed/);
    } finally {
      key.fill(0);
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
