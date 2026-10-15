jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined),
}));
jest.mock("nostr-tools/pool", () => ({ SimplePool: jest.fn().mockImplementation(() => ({
  subscribeMany: jest.fn(() => ({ close: jest.fn() })),
  querySync: jest.fn(async () => []),
  publish: jest.fn(() => [Promise.resolve("ok")]), destroy: jest.fn(),
})) }));
jest.mock("../store/swaps", () => ({ useSwaps: { getState: () => ({ records: {} }), subscribe: () => () => undefined }, swapState: jest.fn() }));
jest.mock("./nostr", () => ({ query: jest.fn(async () => []) }));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { SimplePool } from "nostr-tools/pool";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { observedContact, openContacts, sealContacts } from "../lib/contacts";
import type { KeyRing } from "../lib/keys";
import { useContacts } from "../store/contacts";
import { startContacts } from "./contacts";
import { query } from "./nostr";

function keys(value: number): KeyRing {
  const sk = new Uint8Array(32).fill(value);
  const pair = { sk, pk: getPublicKey(sk) };
  return { identity: pair, escrow: pair, resolver: pair };
}
const owner = keys(1);
const peer = "ab".repeat(32);
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const latestPool = () => jest.mocked(SimplePool).mock.results.at(-1)!.value;

describe("contact synchronization", () => {
  let stop: (() => void) | undefined;
  beforeEach(() => {
    jest.useFakeTimers(); jest.clearAllMocks();
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    jest.mocked(query).mockResolvedValue([]);
    useContacts.setState({ owner: null, entries: {}, ready: false, syncing: false, error: null });
  });
  afterEach(() => { stop?.(); stop = undefined; jest.clearAllTimers(); jest.useRealTimers(); });

  it("migrates old recents only after saving an encrypted cache, and publishes no plaintext", async () => {
    const migrated = jest.fn();
    stop = startContacts(owner, ["wss://relay.example"], ["jane@pay.example"], migrated);
    await tick();
    expect(migrated).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1500);
    const [key, raw] = jest.mocked(AsyncStorage.setItem).mock.calls[0];
    expect(key).toBe(`clink.contacts.${owner.identity.pk}`);
    expect(raw).not.toContain("jane@pay.example");
    expect(Object.values(openContacts(JSON.parse(raw), owner.identity))[0].address).toBe("jane@pay.example");
    expect(migrated).toHaveBeenCalledTimes(1);
    expect(latestPool().publish).toHaveBeenCalledWith(["wss://relay.example"], expect.objectContaining(JSON.parse(raw)), expect.any(Object));
  });

  it("merges relay recovery with offline observations instead of overwriting either", async () => {
    stop = startContacts(owner, ["wss://relay.example"]);
    await tick();
    useContacts.getState().record({ pubkey: peer, role: "user", at: 10 });
    const agent = observedContact({ pubkey: peer, name: "Jane", role: "agent", at: 20 })!;
    latestPool().subscribeMany.mock.calls[0][2].onevent(sealContacts({ [peer]: agent }, owner.identity, 20));
    expect(useContacts.getState().entries[peer]).toMatchObject({ roles: ["agent", "user"], name: "Jane" });
    await jest.advanceTimersByTimeAsync(1500);
    const event = latestPool().publish.mock.calls[0][1];
    expect(openContacts(event, owner.identity)[peer].roles).toEqual(["agent", "user"]);
  });

  it("retains an encrypted local copy and retries when every relay is offline", async () => {
    stop = startContacts(owner, ["wss://relay.example"]);
    latestPool().publish.mockImplementation(() => [Promise.reject(new Error("offline"))]);
    await tick();
    useContacts.getState().record({ address: "jane@pay.example", role: "user", at: 10 });
    await jest.advanceTimersByTimeAsync(1500);
    expect(AsyncStorage.setItem).toHaveBeenCalled();
    expect(useContacts.getState().error).toMatch(/sync/);
    latestPool().publish.mockImplementation(() => [Promise.resolve("ok")]);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(useContacts.getState().error).toBeNull();
  });

  it("ignores a previous wallet's delayed cache and relay results", async () => {
    const contact = observedContact({ pubkey: peer, role: "user", at: 10 })!;
    let resolve!: (value: string | null) => void;
    jest.mocked(AsyncStorage.getItem).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const oldStop = startContacts(owner, ["wss://relay.example"]);
    const oldDelivery = latestPool().subscribeMany.mock.calls[0][2].onevent;
    oldStop();
    stop = startContacts(keys(2), ["wss://relay.example"]);
    const event = sealContacts({ [peer]: contact }, owner.identity, 20);
    resolve(JSON.stringify(event)); oldDelivery(event);
    await tick();
    expect(useContacts.getState().owner).toBe(keys(2).identity.pk);
    expect(useContacts.getState().entries).toEqual({});
  });

  it("saves a last observation when leaving before the debounce fires", async () => {
    stop = startContacts(owner, ["wss://relay.example"]);
    await tick();
    useContacts.getState().record({ pubkey: peer, role: "agent", at: 10 });
    stop(); stop = undefined;
    const raw = jest.mocked(AsyncStorage.setItem).mock.calls.at(-1)![1];
    expect(openContacts(JSON.parse(raw), owner.identity)[peer].roles).toEqual(["agent"]);
    expect(useContacts.getState().entries).toEqual({});
  });

  it("resolves published usernames for known agents without changing the interaction time", async () => {
    const agent = keys(3).identity;
    jest.mocked(query).mockResolvedValue([finalizeEvent({ kind: 0, created_at: 10, tags: [], content: JSON.stringify({ name: "Jane", lud16: "jane@pay.example" }) }, agent.sk)]);
    stop = startContacts(owner, ["wss://relay.example"]);
    await tick();
    useContacts.getState().record({ pubkey: agent.pk, role: "agent", at: 5 });
    await jest.advanceTimersByTimeAsync(100);
    expect(useContacts.getState().entries[agent.pk]).toMatchObject({ address: "jane@pay.example", name: "Jane", roles: ["agent"], lastAt: 5 });
  });

  it("does not revive an older username if the latest profile has none", async () => {
    const agent = keys(3).identity;
    jest.mocked(query).mockResolvedValue([
      finalizeEvent({ kind: 0, created_at: 10, tags: [], content: JSON.stringify({ lud16: "jane@pay.example" }) }, agent.sk),
      finalizeEvent({ kind: 0, created_at: 20, tags: [], content: JSON.stringify({ name: "Jane" }) }, agent.sk),
    ]);
    stop = startContacts(owner, ["wss://relay.example"]);
    await tick();
    useContacts.getState().record({ pubkey: agent.pk, role: "agent", at: 5 });
    await jest.advanceTimersByTimeAsync(100);
    expect(useContacts.getState().entries[agent.pk].address).toBeUndefined();
  });
});
