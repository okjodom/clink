import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function checkBreezApiKey(key, now = Date.now()) {
  if (typeof key !== "string" || !key || !/^[A-Za-z0-9+/]+={0,2}$/.test(key)) {
    throw new Error("Breez API key must be a complete base64-encoded certificate");
  }
  const der = Buffer.from(key, "base64");
  let cert;
  try { cert = new X509Certificate(der); } catch {
    throw new Error("Breez API key certificate is malformed or truncated; replace BREEZ_API_KEY with the complete key");
  }
  if (der.toString("base64") !== key || !der.equals(cert.raw)) {
    throw new Error("Breez API key must contain exactly one complete certificate");
  }
  if (now < Date.parse(cert.validFrom) || now >= Date.parse(cert.validTo)) {
    throw new Error("Breez API key certificate is expired or not yet valid");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const configPath = process.argv[2];
  const key = configPath
    ? JSON.parse(readFileSync(configPath, "utf8")).extra?.breezApiKey
    : process.env.EXPO_PUBLIC_BREEZ_API_KEY;
  try {
    checkBreezApiKey(key);
    console.log("Breez API key certificate is complete and within its validity dates.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
