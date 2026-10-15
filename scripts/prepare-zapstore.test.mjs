import assert from "node:assert/strict";
import { test } from "node:test";
import { releaseFilters, verifyApk } from "./prepare-zapstore.mjs";

const release = {
  tagName: "v0.3.0", isDraft: false, isPrerelease: false,
  assets: [{ name: "clink-v0.3.0.apk", size: 100 }, { name: "clink-v0.3.0.apk.sha256", size: 80 }],
};
const apk = {
  package_id: "com.clink.me", version_name: "0.3.0", version_code: 3000,
  architectures: ["arm64-v8a", "armeabi-v7a"], cert_fingerprint: "a".repeat(64),
};

test("publication matches exactly the requested release and APK", () => {
  const filters = releaseFilters("v0.3.0", release).trim().split("\n");
  const [tagPattern, assetPattern] = filters.map((line) => new RegExp(JSON.parse(line.split(": ")[1])));
  assert.ok(tagPattern.test("v0.3.0"));
  assert.ok(!tagPattern.test("v0x3x0"));
  assert.ok(!tagPattern.test("v0.3.01"));
  assert.ok(assetPattern.test("clink-v0.3.0.apk"));
  assert.ok(!assetPattern.test("clink-v0.3.0-debug.apk"));
  assert.ok(!assetPattern.test("clink-v0.3.1.apk"));
});

test("unpublished, mismatched and incomplete releases cannot be distributed", () => {
  for (const change of [
    { isDraft: true }, { isPrerelease: true }, { tagName: "v0.3.1" }, { assets: [] },
    { assets: [...release.assets, release.assets[0]] },
    { assets: [{ ...release.assets[0], size: 0 }, release.assets[1]] },
  ]) assert.throws(() => releaseFilters("v0.3.0", { ...release, ...change }));
  for (const tag of ["main", "v0.3.0-beta.1", "../main", "v0.3.0\n"]) {
    assert.throws(() => releaseFilters(tag, release));
  }
});

test("only the signed production ARM64 APK for this version is accepted", () => {
  verifyApk("v0.3.0", apk);
  for (const change of [
    { package_id: "com.dev.clink.me" }, { version_name: "0.2.1" }, { version_code: 2999 },
    { architectures: ["x86_64"] }, { cert_fingerprint: "" },
  ]) assert.throws(() => verifyApk("v0.3.0", { ...apk, ...change }));
});
