import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function signProof(cli, keystore, output) {
  const bytes = readFileSync(keystore);
  const isJks = bytes.length >= 4 && bytes.readUInt32BE(0) === 0xfeedfeed;
  if (!isJks && bytes[0] !== 0x30) throw new Error("Unrecognized Android signing keystore format");
  const dir = mkdtempSync(join(tmpdir(), "clink-zapstore-proof-"));
  try {
    // zsp v0.4.17 chooses its parser by extension. Android's .keystore
    // filename can contain either JKS or PKCS#12 bytes; match the content.
    const path = join(dir, isJks ? "signing.jks" : "signing.p12");
    copyFileSync(keystore, path);
    chmodSync(path, 0o600);
    const result = spawnSync(cli, ["identity", "--link-key", path, "--key-alias", "clink", "--offline"], {
      encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Zapstore proof signing failed: ${result.stderr.trim()}`);
    const proof = JSON.parse(result.stdout);
    if (proof.kind !== 30509 || !/^[a-f0-9]{128}$/.test(proof.sig ?? "")) {
      throw new Error("Zapstore CLI did not produce a signed certificate proof");
    }
    writeFileSync(output, JSON.stringify(proof) + "\n", { mode: 0o600 });
    return proof;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  signProof(...process.argv.slice(2));
  console.log("Android signing certificate proof generated successfully.");
}
