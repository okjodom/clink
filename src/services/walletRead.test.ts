import { readWalletState } from "./walletRead";

it("returns a real native-wallet lock without waiting for a full network sync", async () => {
  const sync = jest.fn(() => new Promise<void>(() => undefined));
  const lock = { id: "funded", status: "waiting" };
  expect(await readWalletState(async () => lock, sync)).toBe(lock);
  expect(sync).not.toHaveBeenCalled();
});

it("requests missing lock data in the background without turning absence into a payment", async () => {
  const sync = jest.fn(() => new Promise<void>(() => undefined));
  expect(await readWalletState(async () => null, sync)).toBeNull();
  expect(await readWalletState(async () => null, sync)).toBeNull();
  expect(sync).toHaveBeenCalledTimes(1);
});

it("strict decisions wait for fresh state and propagate failed synchronization", async () => {
  let finish!: () => void;
  const sync = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  const read = jest.fn(async () => null);
  const decision = readWalletState(read, sync, { requireSync: true });
  expect(read).not.toHaveBeenCalled();
  finish();
  expect(await decision).toBeNull();
  const failing = jest.fn(async () => { throw new Error("offline"); });
  await expect(readWalletState(read, failing, { requireSync: true })).rejects.toThrow("offline");
  expect(read).toHaveBeenCalledTimes(1);
});

it("cached-only recovery never requests network state", async () => {
  const sync = jest.fn(async () => undefined);
  expect(await readWalletState(async () => null, sync, { skipSync: true })).toBeNull();
  expect(sync).not.toHaveBeenCalled();
});
