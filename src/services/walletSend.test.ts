jest.mock("expo-file-system", () => ({ Paths: { document: { uri: "file:///wallet" } } }));
jest.mock("./config", () => ({ BREEZ_API_KEY: "test", BREEZ_NETWORK: "mainnet" }));
jest.mock("./secure", () => ({ getSecret: jest.fn(async () => "test mnemonic"), setSecret: jest.fn(), deleteSecret: jest.fn() }));
jest.mock("@breeztech/breez-sdk-spark-react-native", () => {
  const variant = (tag: string) => class {
    tag = tag;
    inner: unknown[];
    constructor(value: unknown) { this.inner = [value]; }
    static instanceOf(value: { tag: string }) { return value.tag === tag; }
  };
  return {
    connect: jest.fn(), defaultConfig: () => ({}), Network: { Mainnet: "mainnet" },
    Seed: { Mnemonic: class {} }, MaxFee: { Rate: class { tag = "Rate"; constructor(public inner: unknown) {} } }, PaymentRequest: { Input: class { constructor(public inner: unknown) {} } },
    InputType: Object.fromEntries(["Bolt11Invoice", "LightningAddress", "LnurlPay", "BitcoinAddress", "SparkAddress", "SparkInvoice", "CrossChainAddress", "Bip21"].map((tag) => [tag, variant(tag)])),
  };
});

import { connect as breezConnect } from "@breeztech/breez-sdk-spark-react-native";
import * as wallet from "./wallet";
import { setSecret } from "./secure";

const sdk = {
  parse: jest.fn(), prepareSendPayment: jest.fn(), prepareLnurlPay: jest.fn(), sendPayment: jest.fn(),
  addEventListener: jest.fn(async () => "listener"), removeEventListener: jest.fn(), disconnect: jest.fn(),
};
const native = (tag: string, details: unknown) => ({ tag, inner: [details] });

beforeEach(async () => {
  await wallet.disconnect();
  jest.clearAllMocks();
  jest.mocked(breezConnect).mockResolvedValue(sdk as never);
  sdk.prepareSendPayment.mockImplementation(async (request) => ({ amount: request.amount, paymentMethod: { inner: { fee: 2n } } }));
});

it("rejects recovery phrases other than 12 valid words before changing the wallet", async () => {
  await wallet.connect();
  for (const phrase of [[...Array(23).fill("abandon"), "art"].join(" "), Array(12).fill("abandon").join(" "), "not a valid recovery phrase"]) {
    await expect(wallet.restoreMnemonic(phrase)).rejects.toThrow(/12 recovery words/);
  }
  expect(sdk.disconnect).not.toHaveBeenCalled();
  expect(setSecret).not.toHaveBeenCalled();
});

it("accepts an amountless Lightning invoice and passes the user's amount to the SDK", async () => {
  sdk.parse.mockResolvedValue(native("Bolt11Invoice", { invoice: { bolt11: "lnbc-open" }, description: "Lunch" }));
  const parsed = await wallet.parseInput("lightning:lnbc-open");
  expect(parsed).toMatchObject({ type: "bolt11", amountSats: undefined });
  const quote = await wallet.prepareSend(parsed, 125n);
  expect(sdk.prepareSendPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 125n, paymentRequest: expect.objectContaining({ inner: { input: "lnbc-open" } }) }));
  expect(quote.amountSats).toBe(125n);
  expect(quote.feeSats).toBe(2n);
  expect(sdk.sendPayment).not.toHaveBeenCalled();
});

it("keeps a fixed Lightning invoice amount and rejects overriding it", async () => {
  sdk.parse.mockResolvedValue(native("Bolt11Invoice", { invoice: { bolt11: "lnbc-fixed" }, amountMsat: 21000n }));
  const parsed = await wallet.parseInput("lnbc-fixed");
  await wallet.prepareSend(parsed);
  expect(sdk.prepareSendPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 21n }));
  sdk.prepareSendPayment.mockClear();
  await expect(wallet.prepareSend(parsed, 22n)).rejects.toThrow(/fixed amount/);
  expect(sdk.prepareSendPayment).not.toHaveBeenCalled();
});

it.each(["BitcoinAddress", "SparkAddress"])("prepares an amountless %s destination with the entered amount", async (tag) => {
  sdk.parse.mockResolvedValue(native(tag, { address: "destination" }));
  const parsed = await wallet.parseInput("destination");
  await wallet.prepareSend(parsed, 150n);
  expect(sdk.prepareSendPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 150n }));
});

it("rejects missing and zero amounts before requesting a quote", async () => {
  for (const amount of [undefined, 0n, -1n]) await expect(wallet.prepareSend({ type: "bolt11", raw: "open" }, amount)).rejects.toThrow(/greater than zero/);
  expect(sdk.prepareSendPayment).not.toHaveBeenCalled();
});

it("supports open Bitcoin Spark invoices without treating token invoices as sats", async () => {
  sdk.parse.mockResolvedValue(native("SparkInvoice", { invoice: "spark-open" }));
  const parsed = await wallet.parseInput("spark-open");
  await wallet.prepareSend(parsed, 200n);
  expect(sdk.prepareSendPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 200n, paymentRequest: expect.objectContaining({ inner: { input: "spark-open" } }) }));
  sdk.parse.mockResolvedValue(native("SparkInvoice", { invoice: "token-invoice", amount: 1000n, tokenIdentifier: "token" }));
  await expect(wallet.parseInput("token-invoice")).rejects.toThrow(/token payment/);
});

it("keeps fixed Spark invoice amounts locked", async () => {
  sdk.parse.mockResolvedValue(native("SparkInvoice", { invoice: "spark-fixed", amount: 200n }));
  const parsed = await wallet.parseInput("spark-fixed");
  await wallet.prepareSend(parsed);
  expect(sdk.prepareSendPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 200n }));
  await expect(wallet.prepareSend(parsed, 201n)).rejects.toThrow(/fixed amount/);
});

it("prepares Lightning addresses with the entered amount and enforces recipient limits", async () => {
  const payRequest = { minSendable: 1000n, maxSendable: 100000n };
  sdk.parse.mockResolvedValue(native("LightningAddress", { address: "person@breez.tips", payRequest }));
  sdk.prepareLnurlPay.mockResolvedValue({ amountSats: 20n, feeSats: 1n });
  const parsed = await wallet.parseInput("person@breez.tips");
  const quote = await wallet.prepareSend(parsed, 20n);
  expect(quote.amountSats).toBe(20n);
  expect(sdk.prepareLnurlPay).toHaveBeenCalledWith(expect.objectContaining({ amount: 20n, payRequest }));
  sdk.prepareLnurlPay.mockClear();
  for (const amount of [0n, -1n, 101n]) await expect(wallet.prepareSend(parsed, amount)).rejects.toThrow();
  expect(sdk.prepareLnurlPay).not.toHaveBeenCalled();
});

it("keeps the BIP21 amount when its preferred Lightning invoice is amountless", async () => {
  sdk.parse.mockResolvedValue(native("Bip21", { amountSat: 300n, paymentMethods: [native("Bolt11Invoice", { invoice: { bolt11: "lnbc-open" } })] }));
  const parsed = await wallet.parseInput("bitcoin:address?amount=0.000003&lightning=lnbc-open");
  expect(parsed).toMatchObject({ type: "bolt11", amountSats: 300n });
  await wallet.prepareSend(parsed);
  expect(sdk.prepareSendPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 300n }));
});
