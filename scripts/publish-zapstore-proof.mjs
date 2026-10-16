import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

class ProofRejection extends Error {}

// zsp signs the proof offline; its online identity command requires an
// interactive menu. Wait for the relay's explicit acceptance in CI instead.
export function publishProof(event, Socket = WebSocket, timeoutMs = 30_000) {
  assert.equal(event.kind, 30509, "Expected a signed NIP-C1 identity proof");
  assert.match(event.id, /^[a-f0-9]{64}$/);
  assert.match(event.sig, /^[a-f0-9]{128}$/);
  return new Promise((resolve, reject) => {
    const socket = new Socket("wss://relay.zapstore.dev");
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error("Timed out waiting for Zapstore proof acceptance")), timeoutMs);
    socket.addEventListener("open", () => socket.send(JSON.stringify(["EVENT", event])));
    socket.addEventListener("error", () => finish(new Error("Zapstore proof connection failed")));
    socket.addEventListener("close", () => finish(new Error("Zapstore closed before accepting the proof")));
    socket.addEventListener("message", ({ data }) => {
      let response;
      try { response = JSON.parse(String(data)); } catch { return; }
      if (!Array.isArray(response) || response[0] !== "OK" || response[1] !== event.id) return;
      finish(response[2] === true ? undefined : new ProofRejection(`Zapstore rejected the proof: ${response[3] ?? "unknown reason"}`));
    });
  });
}

export async function publishProofWithRetry(event, { Socket = WebSocket, timeoutMs = 30_000, attempts = 3, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await publishProof(event, Socket, timeoutMs); } catch (error) {
      if (error instanceof ProofRejection || error instanceof assert.AssertionError || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await publishProofWithRetry(JSON.parse(readFileSync(process.argv[2], "utf8")));
  console.log("Zapstore accepted the Android signing certificate proof.");
}
