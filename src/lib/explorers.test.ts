import { transactionExplorer } from "./explorers";

it("links blockchain hashes to the matching network's explorer", () => {
  const hex = "a".repeat(64);
  expect(transactionExplorer("bitcoin", hex)).toBe(`https://mempool.space/tx/${hex}`);
  expect(transactionExplorer("Base", `0x${hex}`)).toBe(`https://basescan.org/tx/0x${hex}`);
  expect(transactionExplorer("ethereum", `0x${hex}`)).toBe(`https://etherscan.io/tx/0x${hex}`);
  expect(transactionExplorer("tron", hex)).toBe(`https://tronscan.org/#/transaction/${hex}`);
  expect(transactionExplorer("solana", "a".repeat(88))).toBe(`https://solscan.io/tx/${"a".repeat(88)}`);
});

it("does not link wallet IDs, missing hashes, unknown networks or injected paths", () => {
  expect(transactionExplorer("bitcoin", "01a14119-8c2a-0000-0000-005c3655d195")).toBeUndefined();
  expect(transactionExplorer("base", undefined)).toBeUndefined();
  expect(transactionExplorer("unknown", `0x${"a".repeat(64)}`)).toBeUndefined();
  expect(transactionExplorer("bitcoin", `${"a".repeat(64)}?redirect=https://example.com`)).toBeUndefined();
});
