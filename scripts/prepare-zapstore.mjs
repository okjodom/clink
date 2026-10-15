import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function releaseVersion(tag) {
  assert.match(tag, /^v\d+\.\d+\.\d+$/, "Expected a stable release tag such as v0.3.0");
  return tag.slice(1);
}

export function releaseFilters(tag, release) {
  releaseVersion(tag);
  assert.equal(release.tagName, tag, "Release must match the requested tag");
  assert.equal(release.isDraft, false, "Draft releases cannot be published");
  assert.equal(release.isPrerelease, false, "Prereleases cannot be published to the main channel");
  const apk = `clink-${tag}.apk`;
  for (const name of [apk, `${apk}.sha256`]) {
    assert.equal(release.assets.filter((asset) => asset.name === name && asset.size > 0).length, 1,
      `Expected one nonempty release asset: ${name}`);
  }
  const exact = (value) => `^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
  return `\nrelease_filter: ${JSON.stringify(exact(tag))}\nmatch: ${JSON.stringify(exact(apk))}\n`;
}

export function verifyApk(tag, apk) {
  assert.equal(apk.package_id, "com.clink.me", "Only the production application may be published");
  assert.equal(apk.version_name, releaseVersion(tag), "APK version must match the release");
  const [major, minor, patch] = apk.version_name.split(".").map(Number);
  assert.equal(apk.version_code, major * 1_000_000 + minor * 1_000 + patch, "Unexpected Android version code");
  assert.ok(apk.architectures.includes("arm64-v8a"), "Zapstore requires arm64-v8a support");
  assert.match(apk.cert_fingerprint, /^[a-f0-9]{64}$/, "APK must have a verified signing certificate");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === "--verify-apk") {
    verifyApk(args[1], JSON.parse(readFileSync(args[2], "utf8")));
  } else {
    const [tag, releasePath, outputPath] = args;
    const filters = releaseFilters(tag, JSON.parse(readFileSync(releasePath, "utf8")));
    writeFileSync(outputPath, readFileSync("zapstore.yaml", "utf8") + filters);
  }
}
