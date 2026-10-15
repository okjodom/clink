import { getPublicKey } from "nostr-tools/pure";
import { contactsFingerprint, mergeContacts, observedContact, openContacts, parseContactIndex, sealContacts } from "./contacts";

const sk = new Uint8Array(32).fill(1);
const owner = { sk, pk: getPublicKey(sk) };
const peer = "ab".repeat(32);
const person = observedContact({ pubkey: peer, address: "Jane@pay.example", name: "Jane", role: "user", at: 10 })!;

describe("private contact index", () => {
  it("encrypts identities, roles and names with only an app identifier in public tags", () => {
    const event = sealContacts({ [person.id]: person }, owner, 20);
    expect(event.tags).toEqual([["d", "clink.contacts.v1"]]);
    for (const secret of [peer, person.address!, person.name!, '"roles"']) expect(JSON.stringify(event)).not.toContain(secret);
    expect(openContacts(event, owner)).toEqual({ [person.id]: person });
  });

  it("rejects a foreign wallet and tampered encrypted events", () => {
    const event = sealContacts({ [person.id]: person }, owner, 20);
    const otherSk = new Uint8Array(32).fill(2);
    expect(() => openContacts(event, { sk: otherSk, pk: getPublicKey(otherSk) })).toThrow();
    expect(() => openContacts({ ...event, content: event.content + "x" }, owner)).toThrow();
  });

  it("keeps both roles and merges stale snapshots without losing the latest name", () => {
    const agent = observedContact({ pubkey: peer, name: "Jane's desk", role: "agent", at: 30 })!;
    const a = mergeContacts({ [person.id]: person }, [agent]);
    const b = mergeContacts({ [agent.id]: agent }, [person]);
    expect(contactsFingerprint(a)).toBe(contactsFingerprint(b));
    expect(a[peer]).toMatchObject({ roles: ["agent", "user"], name: "Jane's desk", address: "jane@pay.example", lastAt: 30 });
    expect(mergeContacts(a, [person])).toBe(a);
  });

  it("does not merge different identities that claim the same payment address", () => {
    const other = { ...person, id: "cd".repeat(32), pubkey: "cd".repeat(32) };
    expect(Object.keys(mergeContacts({ [peer]: person }, [other]))).toHaveLength(2);
  });

  it("joins an address-only payment and a known agent into one person across stale snapshots", () => {
    const addressOnly = observedContact({ address: person.address, role: "user", at: 40 })!;
    const agent = { ...person, roles: ["agent" as const] };
    const combined = mergeContacts({ [addressOnly.id]: addressOnly }, [agent]);
    expect(Object.keys(combined)).toEqual([peer]);
    expect(combined[peer]).toMatchObject({ roles: ["agent", "user"], lastAt: 40 });
    expect(mergeContacts(combined, [addressOnly])).toBe(combined);
    expect(contactsFingerprint(mergeContacts({ [peer]: agent }, [addressOnly]))).toBe(contactsFingerprint(combined));
  });

  it("validates decrypted data before accepting it", () => {
    expect(parseContactIndex(JSON.stringify({ v: 1, contacts: [person] }))).toEqual({ [peer]: person });
    for (const contact of [{ ...person, id: "wrong" }, { ...person, roles: ["admin"] }, { ...person, lastAt: -1 }, { ...person, address: "bad address" }]) {
      expect(() => parseContactIndex(JSON.stringify({ v: 1, contacts: [contact] }))).toThrow();
    }
    expect(() => parseContactIndex('{"v":2,"contacts":[]}')).toThrow();
  });
});
