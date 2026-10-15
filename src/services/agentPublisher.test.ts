jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock("./config", () => ({ BREEZ_NETWORK: "mainnet" }));
jest.mock("./discovery", () => ({ validDescriptor: jest.fn() }));
jest.mock("./nostr", () => ({ latestByAddress: jest.fn(), publish: jest.fn(), query: jest.fn(), sign: jest.fn() }));

import type { KeyRing } from "../lib/keys";
import { defaultMarket, useAgent } from "../store/agent";
import { buildOffers } from "./agentPublisher";

const pair = { pk: "11".repeat(32), sk: new Uint8Array(32).fill(1) };
const keys: KeyRing = { identity: pair, escrow: pair, resolver: pair };
const market = () => ({ ...defaultMarket("KES"), channels: { cash_ke_kes: {} } });
const offers = (m: ReturnType<typeof market>) => buildOffers(keys, m, 10_000_000, 1_000_000, 2_000_000_000);

beforeEach(() => useAgent.getState().reset());

describe("agent fee cap", () => {
  it("allows a 5% margin on both sides", () => {
    const m = market();
    m.buy.spreadPct = m.sell.spreadPct = 5;
    useAgent.getState().saveMarkets([m]);
    const built = offers(m);
    expect(built.buy).toMatchObject({ price: "10500000", premium: "5" });
    expect(built.sell).toMatchObject({ price: "9500000", premium: "-5" });
  });

  it.each([5.001, 30, Number.POSITIVE_INFINITY, Number.NaN])("rejects saving an invalid margin (%s) without changing settings", (margin) => {
    const valid = market();
    useAgent.getState().saveMarkets([valid]);
    const invalid = market();
    invalid.sell.spreadPct = margin;
    expect(() => useAgent.getState().saveMarkets([invalid])).toThrow("5%");
    expect(useAgent.getState().markets).toEqual([valid]);
  });

  it.each(["buy", "sell"] as const)("does not publish a legacy %s fee above 5%, while retaining the valid side", (side) => {
    const m = market();
    m[side].spreadPct = 30;
    const built = offers(m);
    expect(built[side]).toBeUndefined();
    expect(built[side === "buy" ? "sell" : "buy"]).toBeDefined();
  });

  it("keeps transaction limits agent-defined without an application maximum", () => {
    const m = market();
    m.sell.min = "1000000";
    m.sell.max = "1000000000";
    useAgent.getState().saveMarkets([m]);
    expect(offers(m).sell).toMatchObject({ min: "1000000", max: "1000000000" });
  });
});
