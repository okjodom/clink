import assert from "node:assert/strict";
import { test } from "node:test";
import { publishProof } from "./publish-zapstore-proof.mjs";

const event = { kind: 30509, id: "a".repeat(64), sig: "b".repeat(128) };
function socketWith(responses) {
  return class extends EventTarget {
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
    send(payload) {
      assert.deepEqual(JSON.parse(payload), ["EVENT", event]);
      for (const response of responses) this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(response) }));
    }
    close() { this.dispatchEvent(new Event("close")); }
  };
}

test("publishing requires acceptance of this exact proof", async () => {
  await publishProof(event, socketWith([["OK", "other", false], ["OK", event.id, true]]));
  await assert.rejects(publishProof(event, socketWith([["OK", event.id, false, "blocked"]])), /rejected.*blocked/);
  await assert.rejects(publishProof(event, socketWith([["OK", "other", true]]), 5), /Timed out/);
});

test("connection failure cannot silently count as success", async () => {
  class FailedSocket extends EventTarget {
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event("error"))); }
    close() {}
  }
  await assert.rejects(publishProof(event, FailedSocket), /connection failed/);
  assert.throws(() => publishProof({ ...event, kind: 1 }, FailedSocket), /identity proof/);
});
