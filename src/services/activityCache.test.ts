jest.mock("./swapStorage", () => ({ encryptedSwapStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));

import { readActivityCache, writeActivityCache } from "./activityCache";
import { encryptedSwapStorage } from "./swapStorage";
import type { WalletTx } from "./wallet";

const tx: WalletTx = { id: "pending", amountSats: 1234567890123456789n, feeSats: 0n, direction: "in", status: "pending", kind: "onchain", timestamp: 100, invoice: "not needed in cache" };

beforeEach(() => jest.clearAllMocks());

it("round-trips large amounts and pending status without retaining invoice payloads", async () => {
  await writeActivityCache("mainnet.alice", [tx]);
  const [name, value] = jest.mocked(encryptedSwapStorage.setItem).mock.calls[0];
  expect(name).toContain("mainnet.alice");
  expect(value).not.toContain("not needed in cache");
  jest.mocked(encryptedSwapStorage.getItem).mockResolvedValue(value);
  expect(await readActivityCache("mainnet.alice")).toEqual([{ ...tx, invoice: undefined }]);
  expect(await readActivityCache("mainnet.bob")).toBeNull();
  expect(await readActivityCache("regtest.alice")).toBeNull();
});

it("ignores corrupt or unavailable encrypted cache data", async () => {
  jest.mocked(encryptedSwapStorage.getItem).mockResolvedValue("broken");
  expect(await readActivityCache("alice")).toBeNull();
  jest.mocked(encryptedSwapStorage.getItem).mockRejectedValue(new Error("key unavailable"));
  expect(await readActivityCache("alice")).toBeNull();
});
