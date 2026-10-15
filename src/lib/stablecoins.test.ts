import { assetLabel, chainLabel, chainOrder, formatUsd, fromBaseUnits, looksLikeStablecoinAddress, quoteExpiry, tokenAmount, toBaseUnits } from "./stablecoins";

describe("toBaseUnits / fromBaseUnits", () => {
  it("retains exact sub-cent receive amounts instead of rounding a deposit down", () => {
    expect(tokenAmount(1_013_457n, 6)).toBe("1.013457");
    expect(tokenAmount(1_000_000n, 6)).toBe("1");
    expect(tokenAmount(1n, 18)).toBe("0.000000000000000001");
  });
  it("reads ISO send expiries and integer receive expiries and rejects invalid quotes", () => {
    const iso = "2026-10-15T20:30:00Z";
    const seconds = Date.parse(iso) / 1000;
    expect(quoteExpiry(iso)).toBe(seconds);
    expect(quoteExpiry(BigInt(seconds))).toBe(seconds);
    expect(quoteExpiry(String(seconds))).toBe(seconds);
    expect(() => quoteExpiry("invalid")).toThrow(/expiry/);
    expect(() => quoteExpiry(0)).toThrow(/expiry/);
  });
  it("converts dollars exactly, for 6 and 18 decimals", () => {
    expect(toBaseUnits("12.5", 6)).toBe(12_500_000n);
    expect(toBaseUnits("0.01", 6)).toBe(10_000n);
    expect(toBaseUnits("3", 18)).toBe(3_000_000_000_000_000_000n);
    expect(toBaseUnits(".5", 6)).toBe(500_000n);
  });
  it("drops digits past the token's precision", () => {
    expect(toBaseUnits("1.1234567", 6)).toBe(1_123_456n);
  });
  it("rejects junk", () => {
    expect(() => toBaseUnits("abc", 6)).toThrow();
    expect(() => toBaseUnits("", 6)).toThrow();
  });
  it("reads base units back as dollars", () => {
    expect(fromBaseUnits(12_500_000n, 6)).toBe(12.5);
    expect(fromBaseUnits(1n, 6)).toBe(0.000001);
  });
});

describe("labels", () => {
  it("names chains and assets the way people know them", () => {
    expect(chainLabel("bsc")).toBe("BNB Chain");
    expect(chainLabel("tron")).toBe("Tron");
    expect(chainLabel("hyperevm")).toBe("Hyperevm");
    expect(assetLabel("USDT0")).toBe("USDT");
    expect(assetLabel("usdc")).toBe("USDC");
  });
  it("puts the common chains first", () => {
    expect(["ethereum", "zksync", "tron", "base"].sort(chainOrder)).toEqual(["tron", "base", "ethereum", "zksync"]);
  });
  it("formats dollars", () => {
    expect(formatUsd(12.5)).toBe("$12.50");
  });
});

describe("looksLikeStablecoinAddress", () => {
  it("spots EVM, Tron and Solana addresses", () => {
    expect(looksLikeStablecoinAddress("0x52908400098527886E0F7030069857D2E4169EE7")).toBe(true);
    expect(looksLikeStablecoinAddress("TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE")).toBe(true);
    expect(looksLikeStablecoinAddress("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin")).toBe(true);
  });
  it("ignores bitcoin and lightning", () => {
    expect(looksLikeStablecoinAddress("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toBe(false);
    expect(looksLikeStablecoinAddress("jane@breez.tips")).toBe(false);
  });
});
