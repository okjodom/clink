jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(async () => undefined),
}));
jest.mock("../services/wallet", () => ({
  balances: jest.fn(), listTransactions: jest.fn(), holdIn: jest.fn(), syncWallet: jest.fn(),
}));

import * as wallet from "../services/wallet";
import { useWallet } from "./wallet";

beforeEach(async () => {
  await Promise.resolve();
  jest.clearAllMocks();
  useWallet.getState().reset();
  jest.mocked(wallet.balances).mockResolvedValue({ sats: 1000n, usd: 0 });
  jest.mocked(wallet.holdIn).mockResolvedValue("bitcoin");
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
