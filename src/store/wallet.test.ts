jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(async () => undefined),
}));
jest.mock("../services/wallet", () => ({
  balances: jest.fn(), listTransactions: jest.fn(), holdIn: jest.fn(), syncWallet: jest.fn(), connect: jest.fn(), onWalletEvent: jest.fn(() => () => undefined), fiatRates: jest.fn(), lightningAddressInfo: jest.fn(async () => null),
}));
jest.mock("../services/activityCache", () => ({ readActivityCache: jest.fn(async () => null), writeActivityCache: jest.fn(async () => undefined), clearActivityCache: jest.fn(async () => undefined) }));

import * as wallet from "../services/wallet";
import { readActivityCache } from "../services/activityCache";
import { useWallet } from "./wallet";

beforeEach(async () => {
  await Promise.resolve();
  jest.clearAllMocks();
  useWallet.getState().reset();
  jest.mocked(wallet.balances).mockResolvedValue({ sats: 1000n, usd: 0 });
  jest.mocked(wallet.holdIn).mockResolvedValue("bitcoin");
  jest.mocked(wallet.fiatRates).mockResolvedValue({ USD: 100000 });
  jest.mocked(wallet.listTransactions).mockResolvedValue([]);
});

it("shows pending incoming payments without adding them to the spendable balance", async () => {
  jest.mocked(wallet.listTransactions).mockResolvedValue([{ id: "pending", direction: "in", amountSats: 2000n, feeSats: 0n, kind: "onchain", status: "pending", timestamp: 100 }]);
  await useWallet.getState().refresh();
  expect(useWallet.getState().balance).toBe(1000);
  expect(useWallet.getState().txs[0].status).toBe("pending");
});

it("does not let a slow older refresh overwrite newly detected funds", async () => {
  let finish!: (balance: wallet.Balances) => void;
  jest.mocked(wallet.balances).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const older = useWallet.getState().refresh();
  jest.mocked(wallet.balances).mockResolvedValue({ sats: 3000n, usd: 0 });
  await useWallet.getState().refresh();
  finish({ sats: 1000n, usd: 0 });
  await older;
  expect(useWallet.getState().balance).toBe(3000);
});

it("does not restore the previous wallet's funds after reset", async () => {
  let finish!: (balance: wallet.Balances) => void;
  jest.mocked(wallet.balances).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const running = useWallet.getState().refresh();
  useWallet.getState().reset();
  finish({ sats: 1000n, usd: 0 });
  await running;
  expect(useWallet.getState().balance).toBeNull();
});

it("coalesces overlapping foreground syncs into one network call and refresh", async () => {
  let finish!: () => void;
  jest.mocked(wallet.syncWallet).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  useWallet.setState({ status: "ready" });
  const first = useWallet.getState().sync();
  const second = useWallet.getState().sync();
  expect(wallet.syncWallet).toHaveBeenCalledTimes(1);
  finish();
  await Promise.all([first, second]);
  expect(wallet.balances).toHaveBeenCalledTimes(1);
});

const cachedTx: wallet.WalletTx = { id: "cached-pending", direction: "in", amountSats: 2000n, feeSats: 0n, kind: "onchain", status: "pending", timestamp: 100 };

it("shows cached activity before the wallet connects without crediting pending funds", async () => {
  let connected!: () => void;
  jest.mocked(wallet.connect).mockImplementationOnce(() => new Promise((resolve) => { connected = () => resolve(undefined as never); }));
  jest.mocked(readActivityCache).mockResolvedValueOnce([cachedTx]);
  const starting = useWallet.getState().start("mainnet.alice");
  await Promise.resolve();
  await Promise.resolve();
  expect(useWallet.getState()).toMatchObject({ status: "connecting", activityLoaded: true, txs: [cachedTx], balance: null });
  connected();
  await starting;
});

it("does not let a late cache overwrite fresh wallet activity", async () => {
  let cached!: (txs: wallet.WalletTx[]) => void;
  jest.mocked(readActivityCache).mockImplementationOnce(() => new Promise((resolve) => { cached = resolve; }));
  const fresh = { ...cachedTx, id: "fresh", status: "complete" as const };
  jest.mocked(wallet.listTransactions).mockResolvedValue([fresh]);
  await useWallet.getState().start("mainnet.alice");
  cached([cachedTx]);
  await Promise.resolve();
  expect(useWallet.getState().txs).toEqual([fresh]);
});

it("rejects the previous account's late cache and connection after reset", async () => {
  let cached!: (txs: wallet.WalletTx[]) => void;
  let connected!: () => void;
  jest.mocked(readActivityCache).mockImplementationOnce(() => new Promise((resolve) => { cached = resolve; }));
  jest.mocked(wallet.connect).mockImplementationOnce(() => new Promise((resolve) => { connected = () => resolve(undefined as never); }));
  const starting = useWallet.getState().start("mainnet.alice");
  useWallet.getState().reset();
  cached([cachedTx]);
  connected();
  await starting;
  expect(useWallet.getState()).toMatchObject({ status: "idle", activityLoaded: false, txs: [], balance: null });
});
