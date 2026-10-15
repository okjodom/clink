/**
 * Breez SDK (Spark) wallet.
 *
 * Self-custodial: the BIP39 phrase is generated on the device, kept in the
 * keychain, and never leaves it. The same phrase derives the Nostr keys
 * (see lib/keys.ts), so one backup restores everything.
 */
import { Paths } from "expo-file-system";
import {
  connect as breezConnect,
  ConversionInfo,
  ConversionStatus,
  ConversionPurpose,
  CrossChainRouteFilter,
  defaultConfig,
  InputType,
  Network,
  OnchainConfirmationSpeed,
  PaymentDetails,
  PaymentMethod,
  PaymentRequest,
  PaymentStatus,
  PaymentType,
  ReceivePaymentMethod,
  Seed,
  SendPaymentMethod,
  SendPaymentOptions,
  SparkAsset,
  SparkHtlcStatus,
  StableBalanceActiveLabel,
  type BreezSdkInterface,
  type CrossChainAddressDetails,
  type CrossChainRoutePair,
  type LnurlPayRequestDetails,
  type Payment,
  type SdkEvent,
} from "@breeztech/breez-sdk-spark-react-native";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { BREEZ_API_KEY, BREEZ_NETWORK } from "./config";
import { deleteSecret, getSecret, setSecret } from "./secure";
import { isValidMnemonic, newMnemonic, normaliseMnemonic } from "../lib/keys";
import { BRAND } from "../brand";
import { DOLLARS_LABEL, USDB_TOKEN, assetLabel, chainLabel, chainOrder, fromBaseUnits, quoteExpiry, tokenAmount, toBaseUnits } from "../lib/stablecoins";
import { usernameFrom } from "../lib/username";
import { paymentDescription, receiveDescription, refreshAddressBrand } from "../lib/paymentBrand";
import { deliveryStatus, quotedFeeSats } from "../lib/sendFlow";

export { usernameFrom };

const MNEMONIC_KEY = "wallet.mnemonic";
const MAINNET = BREEZ_NETWORK !== "regtest";
const STORAGE_DIR = "breez-spark";

export class WalletConfigError extends Error {}

let sdk: BreezSdkInterface | null = null;
let connecting: Promise<BreezSdkInterface> | null = null;
let listenerId: string | null = null;
const listeners = new Set<(e: WalletEvent) => void>();

export type WalletEvent = { type: "synced" } | { type: "payment"; payment: WalletTx };

// -- seed --------------------------------------------------------------------

export async function storedMnemonic(): Promise<string | null> {
  return getSecret(MNEMONIC_KEY);
}

export async function createMnemonic(): Promise<string> {
  const m = newMnemonic();
  await setSecret(MNEMONIC_KEY, m);
  return m;
}

export async function restoreMnemonic(input: string): Promise<string> {
  const m = normaliseMnemonic(input);
  if (!isValidMnemonic(m)) throw new Error("That recovery phrase isn't valid. Check the words and their order.");
  await disconnect();
  await setSecret(MNEMONIC_KEY, m);
  return m;
}

export async function wipeWallet(): Promise<void> {
  await disconnect();
  await deleteSecret(MNEMONIC_KEY);
  try {
    const { Directory } = await import("expo-file-system");
    const dir = new Directory(Paths.document, STORAGE_DIR);
    if (dir.exists) dir.delete();
  } catch {
    // Storage is rebuilt from the seed on next connect.
  }
}

// -- connection --------------------------------------------------------------

function storageDir(): string {
  return `${Paths.document.uri.replace(/^file:\/\//, "").replace(/\/$/, "")}/${STORAGE_DIR}`;
}

export async function connect(): Promise<BreezSdkInterface> {
  if (sdk) return sdk;
  if (connecting) return connecting;
  if (!BREEZ_API_KEY) {
    throw new WalletConfigError("This build has no Breez API key. Set EXPO_PUBLIC_BREEZ_API_KEY and rebuild.");
  }
  const mnemonic = await storedMnemonic();
  if (!mnemonic) throw new Error("No wallet on this device yet");

  connecting = (async () => {
    const config = {
      ...defaultConfig(BREEZ_NETWORK === "regtest" ? Network.Regtest : Network.Mainnet),
      apiKey: BREEZ_API_KEY,
      // Spark-to-Spark keeps swaps and in-app transfers instant and cheap.
      preferSparkOverLightning: true,
      // "Hold in dollars": Breez converts incoming bitcoin to USDB and back
      // again when a payment needs bitcoin. Off until the person turns it on.
      stableBalanceConfig: MAINNET
        ? { tokens: [{ label: DOLLARS_LABEL, tokenIdentifier: USDB_TOKEN }], defaultActiveLabel: undefined, thresholdSats: undefined, maxSlippageBps: undefined }
        : undefined,
      // USDT/USDC to and from other chains. Mainnet only.
      crossChainConfig: MAINNET ? { defaultSlippageBps: undefined, defaultTargetOverpayBps: undefined } : undefined,
    };
    const instance = await breezConnect({
      config,
      seed: new Seed.Mnemonic({ mnemonic, passphrase: undefined }),
      storageDir: storageDir(),
    });
    listenerId = await instance.addEventListener({
      onEvent: async (event: SdkEvent) => {
        const tagged = event as unknown as { tag?: string; inner?: { payment?: Payment } };
        // The wallet's own bitcoin<->dollar conversions are bookkeeping, not money in or out.
        if (tagged.inner?.payment && isOwnConversion(tagged.inner.payment)) emit({ type: "synced" });
        else if (tagged.inner?.payment) emit({ type: "payment", payment: toTx(tagged.inner.payment) });
        else if (tagged.tag === "Synced" || tagged.tag === "ClaimedDeposits") emit({ type: "synced" });
      },
    });
    sdk = instance;
    return instance;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

export async function disconnect(): Promise<void> {
  const instance = sdk;
  sdk = null;
  if (!instance) return;
  try {
    if (listenerId) await instance.removeEventListener(listenerId);
    await instance.disconnect();
  } catch {
    // Already gone.
  } finally {
    listenerId = null;
  }
}

function emit(e: WalletEvent) {
  listeners.forEach((l) => {
    try {
      l(e);
    } catch {
      // A broken listener must not stop the others.
    }
  });
}

export function onWalletEvent(listener: (e: WalletEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// -- balance, rates, history -------------------------------------------------

export interface Balances {
  sats: bigint;
  /** Dollars held as USDB. */
  usd: number;
}

export async function balances(synced = false): Promise<Balances> {
  const s = await connect();
  const info = await s.getInfo({ ensureSynced: synced });
  const usdb = info.tokenBalances.get(USDB_TOKEN);
  return { sats: BigInt(info.balanceSats), usd: usdb ? fromBaseUnits(BigInt(usdb.balance), usdb.tokenMetadata.decimals) : 0 };
}

/** Latest BTC price in USD, for valuing dollars in sats. */
let usdPerBtc: number | null = null;

/** Dollars as sats at today's price, less a percent for the conversion it would take. */
export function usdAsSats(usd: number, haircut = 0.01): bigint {
  if (!(usd > 0) || !usdPerBtc) return 0n;
  return BigInt(Math.floor((usd / usdPerBtc) * 1e8 * (1 - haircut)));
}

/**
 * What the wallet can spend, in sats: bitcoin plus dollars, which Breez
 * converts on the way out. `synced` waits for the wallet to catch up first,
 * e.g. before committing funds.
 */
export async function balanceSats(synced = false): Promise<bigint> {
  const b = await balances(synced);
  if (b.usd > 0 && !usdPerBtc) await fiatRates().catch(() => undefined);
  return b.sats + usdAsSats(b.usd);
}

/** Market price of 1 BTC per fiat currency code, from Breez. */
export async function fiatRates(): Promise<Record<string, number>> {
  const s = await connect();
  const { rates } = await s.listFiatRates();
  const out = Object.fromEntries(rates.map((r) => [r.coin.toUpperCase(), r.value]));
  if (out.USD) usdPerBtc = out.USD;
  return out;
}

// -- hold in dollars or bitcoin ----------------------------------------------

export type HoldIn = "dollars" | "bitcoin";

export async function holdIn(): Promise<HoldIn> {
  if (!MAINNET) return "bitcoin";
  const s = await connect();
  const settings = await s.getUserSettings();
  return settings.stableBalanceActiveLabel ? "dollars" : "bitcoin";
}

/** Switching converts what's there now: bitcoin to dollars, or back. */
export async function setHoldIn(to: HoldIn): Promise<void> {
  if (!MAINNET) throw new Error("Dollars are only available on mainnet");
  const s = await connect();
  await s.updateUserSettings({
    sparkPrivateModeEnabled: undefined,
    stableBalanceActiveLabel: to === "dollars" ? new StableBalanceActiveLabel.Set({ label: DOLLARS_LABEL }) : new StableBalanceActiveLabel.Unset(),
    sparkMasterIdentityPublicKey: undefined,
  });
}

export type TxKind = "lightning" | "spark" | "onchain" | "htlc" | "other";

export interface WalletTx {
  id: string;
  direction: "in" | "out";
  /** For dollar payments, worth this many sats today (filled in by the wallet store). */
  amountSats: bigint;
  feeSats: bigint;
  /** Set when the payment moved dollars rather than bitcoin. */
  usd?: number;
  feeUsd?: number;
  status: "complete" | "pending" | "failed";
  timestamp: number;
  kind: TxKind;
  description?: string;
  recipient?: string;
  invoice?: string;
  blockchainTxId?: string;
  network?: string;
  externalAmount?: string;
  statusLabel?: string;
  htlc?: { paymentHash: string; status: "waiting" | "released" | "returned"; expiresAt: number };
}

function htlcOf(p: Payment): WalletTx["htlc"] {
  const d = p.details;
  if (!d) return undefined;
  const details =
    PaymentDetails.Spark.instanceOf(d) || PaymentDetails.Lightning.instanceOf(d) ? d.inner.htlcDetails : undefined;
  if (!details) return undefined;
  return {
    paymentHash: details.paymentHash,
    status:
      details.status === SparkHtlcStatus.WaitingForPreimage
        ? "waiting"
        : details.status === SparkHtlcStatus.PreimageShared
          ? "released"
          : "returned",
    expiresAt: Number(details.expiryTime),
  };
}

/** One of the wallet's own bitcoin<->dollar conversions, rather than a payment. */
export function isOwnConversion(p: Payment): boolean {
  const d = p.details;
  const info = d && (PaymentDetails.Spark.instanceOf(d) || PaymentDetails.Token.instanceOf(d)) ? d.inner.conversionInfo : undefined;
  if (!info || !ConversionInfo.Amm.instanceOf(info)) return false;
  const purpose = info.inner.purpose;
  return !!purpose && (ConversionPurpose.AutoConversion.instanceOf(purpose) || ConversionPurpose.SelfTransfer.instanceOf(purpose));
}

export function toTx(p: Payment): WalletTx {
  const d = p.details;
  const token = d && PaymentDetails.Token.instanceOf(d) ? d.inner.metadata : undefined;
  const isSpark = !!d && PaymentDetails.Spark.instanceOf(d);
  const htlc = isSpark ? htlcOf(p) : undefined;
  const kind: TxKind = htlc
    ? "htlc"
    : p.method === PaymentMethod.Lightning
      ? "lightning"
      : p.method === PaymentMethod.Spark
        ? "spark"
        : p.method === PaymentMethod.Deposit || p.method === PaymentMethod.Withdraw
          ? "onchain"
          : "other";
  const lightning = d && PaymentDetails.Lightning.instanceOf(d) ? d.inner : undefined;
  const conversion = d && (PaymentDetails.Spark.instanceOf(d) || PaymentDetails.Token.instanceOf(d) || PaymentDetails.Lightning.instanceOf(d)) ? d.inner.conversionInfo : undefined;
  const crossChain = conversion && (ConversionInfo.Orchestra.instanceOf(conversion) || ConversionInfo.Boltz.instanceOf(conversion)) ? conversion.inner : undefined;
  const outgoing = p.paymentType === PaymentType.Send;
  const baseStatus = p.status === PaymentStatus.Completed ? "complete" : p.status === PaymentStatus.Failed ? "failed" : "pending";
  // Paying the source leg does not mean the bridge has delivered the money.
  const status = deliveryStatus(baseStatus, crossChain ? {
    complete: crossChain.status === ConversionStatus.Completed,
    failed: crossChain.status === ConversionStatus.Failed || crossChain.status === ConversionStatus.Refunded,
  } : undefined);
  const description = paymentDescription(lightning?.description, lightning?.lnurlPayInfo?.lnAddress);
  return {
    id: p.id,
    direction: outgoing ? "out" : "in",
    amountSats: BigInt(p.amount),
    feeSats: BigInt(p.fees),
    status,
    statusLabel: crossChain?.status === ConversionStatus.RefundNeeded ? "Refund pending" : crossChain?.status === ConversionStatus.Refunded ? "Refunded" : undefined,
    timestamp: Number(p.timestamp),
    kind,
    description,
    recipient: outgoing && crossChain ? crossChain.recipientAddress : lightning?.lnurlPayInfo?.lnAddress,
    invoice: lightning?.invoice,
    blockchainTxId: conversion && ConversionInfo.Orchestra.instanceOf(conversion) ? conversion.inner.externalTxHash
      : d && (PaymentDetails.Withdraw.instanceOf(d) || PaymentDetails.Deposit.instanceOf(d)) ? d.inner.txId || undefined : undefined,
    network: crossChain ? `${assetLabel(crossChain.asset)} on ${chainLabel(crossChain.chain)}` : undefined,
    externalAmount: crossChain && outgoing ? `${tokenAmount(BigInt(crossChain.deliveredAmount ?? crossChain.estimatedOut), crossChain.assetDecimals)} ${assetLabel(crossChain.asset)}` : undefined,
    htlc,
    ...(token
      ? { amountSats: 0n, feeSats: 0n, usd: fromBaseUnits(BigInt(p.amount), token.decimals), feeUsd: fromBaseUnits(BigInt(p.fees), token.decimals) }
      : {}),
  };
}

export async function listTransactions(limit = 50): Promise<WalletTx[]> {
  const s = await connect();
  const { payments } = await s.listPayments({
    typeFilter: undefined,
    statusFilter: undefined,
    assetFilter: undefined,
    paymentDetailsFilter: undefined,
    fromTimestamp: undefined,
    toTimestamp: undefined,
    offset: undefined,
    limit,
    sortAscending: false,
  });
  return payments.filter((p) => !isOwnConversion(p)).map(toTx);
}

export async function getTransaction(id: string): Promise<WalletTx> {
  const s = await connect();
  return toTx((await s.getPayment({ paymentId: id })).payment);
}

// -- receive -----------------------------------------------------------------

export async function receiveInvoice(amountSats: bigint | undefined, description: string): Promise<string> {
  const s = await connect();
  const res = await s.receivePayment({
    paymentMethod: new ReceivePaymentMethod.Bolt11Invoice({
      description,
      amountSats,
      expirySecs: undefined,
      paymentHash: undefined,
      receiverIdentityPublicKey: undefined,
    }),
  });
  return res.paymentRequest;
}

export async function sparkAddress(): Promise<string> {
  const s = await connect();
  const res = await s.receivePayment({ paymentMethod: new ReceivePaymentMethod.SparkAddress() });
  return res.paymentRequest;
}

export async function bitcoinAddress(): Promise<string> {
  const s = await connect();
  const res = await s.receivePayment({ paymentMethod: new ReceivePaymentMethod.BitcoinAddress({ newAddress: undefined }) });
  return res.paymentRequest;
}

export interface AddressInfo {
  address: string;
  lnurl: string;
}

export async function lightningAddressInfo(): Promise<AddressInfo | null> {
  const s = await connect();
  const existing = await s.getLightningAddress();
  const info = existing ? await refreshAddressBrand(existing, (username, description) => s.registerLightningAddress({ username, description })) : null;
  return info ? { address: info.lightningAddress, lnurl: info.lnurl.bech32 } : null;
}

export async function claimLightningAddress(username: string): Promise<AddressInfo> {
  const s = await connect();
  const clean = username.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,30}$/.test(clean)) throw new Error("Use 3–31 letters, numbers, dots or dashes.");
  const free = await s.checkLightningAddressAvailable({ username: clean });
  if (!free) throw new Error("That name is taken. Try another.");
  const info = await s.registerLightningAddress({ username: clean, description: receiveDescription(clean) });
  return { address: info.lightningAddress, lnurl: info.lnurl.bech32 };
}

/** The service Lightning addresses are registered on, e.g. "breez.tips". */
export function lightningDomain(): string | null {
  try {
    return defaultConfig(BREEZ_NETWORK === "regtest" ? Network.Regtest : Network.Mainnet).lnurlDomain ?? null;
  } catch {
    return null;
  }
}

/**
 * After a restore: the address this wallet already has, or else `username`
 * claimed again (it was this wallet's before). Null if someone else took it.
 */
export async function reclaimLightningAddress(username: string): Promise<AddressInfo | null> {
  const existing = await lightningAddressInfo();
  if (existing) return existing;
  const s = await connect();
  if (!(await s.checkLightningAddressAvailable({ username }))) return null;
  const info = await s.registerLightningAddress({ username, description: receiveDescription(username) });
  return { address: info.lightningAddress, lnurl: info.lnurl.bech32 };
}

/**
 * Claim `base`, or the first free variant of it (base7, base42…), so picking
 * a name never ends on "that name is taken".
 */
export async function claimFirstFree(base: string): Promise<AddressInfo> {
  const s = await connect();
  const root = usernameFrom(base).padEnd(3, "0");
  const candidates = [root, ...Array.from({ length: 5 }, (_, i) => `${root}${Math.floor(Math.random() * 10 ** (i + 1))}`)];
  for (const username of candidates) {
    if (await s.checkLightningAddressAvailable({ username })) {
      const info = await s.registerLightningAddress({ username, description: receiveDescription(username) });
      return { address: info.lightningAddress, lnurl: info.lnurl.bech32 };
    }
  }
  throw new Error("Couldn't find a free name. Try another.");
}

// -- send --------------------------------------------------------------------

export type ParsedInput =
  | { type: "bolt11"; raw: string; amountSats?: bigint; description?: string }
  | { type: "lnurl"; raw: string; address?: string; payRequest: LnurlPayRequestDetails; minSats: bigint; maxSats: bigint }
  | { type: "onchain"; raw: string; address: string; amountSats?: bigint }
  | { type: "spark"; raw: string; address: string; amountSats?: bigint }
  /** A USDT/USDC address on another chain. */
  | { type: "stablecoin"; raw: string; address: string; details: CrossChainAddressDetails };

export async function parseInput(text: string): Promise<ParsedInput> {
  const s = await connect();
  const raw = text.trim().replace(/^lightning:/i, "");
  const input = await s.parse(raw);
  return fromInput(input, raw);
}

function fromInput(input: InputType, raw: string, amountHint?: bigint): ParsedInput {
  if (InputType.Bolt11Invoice.instanceOf(input)) {
    const d = input.inner[0];
    return {
      type: "bolt11",
      raw: d.invoice.bolt11,
      amountSats: d.amountMsat !== undefined ? BigInt(d.amountMsat) / 1000n : undefined,
      description: paymentDescription(d.description ?? undefined),
    };
  }
  if (InputType.LightningAddress.instanceOf(input)) {
    const d = input.inner[0];
    return {
      type: "lnurl",
      raw,
      address: d.address,
      payRequest: d.payRequest,
      minSats: (BigInt(d.payRequest.minSendable) + 999n) / 1000n,
      maxSats: BigInt(d.payRequest.maxSendable) / 1000n,
    };
  }
  if (InputType.LnurlPay.instanceOf(input)) {
    const d = input.inner[0];
    return {
      type: "lnurl",
      raw,
      address: d.address ?? undefined,
      payRequest: d,
      minSats: (BigInt(d.minSendable) + 999n) / 1000n,
      maxSats: BigInt(d.maxSendable) / 1000n,
    };
  }
  if (InputType.BitcoinAddress.instanceOf(input)) {
    return { type: "onchain", raw, address: input.inner[0].address, amountSats: amountHint };
  }
  if (InputType.SparkAddress.instanceOf(input)) {
    return { type: "spark", raw, address: input.inner[0].address, amountSats: amountHint };
  }
  if (InputType.CrossChainAddress.instanceOf(input)) {
    return { type: "stablecoin", raw, address: input.inner[0].address, details: input.inner[0] };
  }
  if (InputType.Bip21.instanceOf(input)) {
    const d = input.inner[0];
    const amount = d.amountSat !== undefined ? BigInt(d.amountSat) : undefined;
    // Prefer Lightning, then Spark, then on-chain from a unified QR.
    const order = [InputType.Bolt11Invoice, InputType.SparkAddress, InputType.BitcoinAddress] as const;
    for (const t of order) {
      const m = d.paymentMethods.find((pm) => t.instanceOf(pm));
      if (m) return fromInput(m, raw, amount);
    }
  }
  throw new Error(`That doesn't look like something ${BRAND.name} can pay yet.`);
}

export interface PreparedSend {
  amountSats: bigint;
  feeSats: bigint;
  send: () => Promise<WalletTx>;
}

export async function prepareSend(input: ParsedInput, amountSats?: bigint, comment?: string): Promise<PreparedSend> {
  const s = await connect();
  if (input.type === "stablecoin") throw new Error("Use prepareStablecoinSend for USDT/USDC");
  if (input.type === "lnurl") {
    if (!amountSats) throw new Error("Enter an amount");
    const prepared = await s.prepareLnurlPay({
      amount: amountSats,
      payRequest: input.payRequest,
      comment,
      validateSuccessActionUrl: undefined,
      tokenIdentifier: undefined,
      conversionOptions: undefined,
      feePolicy: undefined,
    });
    return {
      amountSats: BigInt(prepared.amountSats),
      feeSats: BigInt(prepared.feeSats),
      send: async () => {
        const res = await s.lnurlPay({ prepareResponse: prepared, idempotencyKey: undefined });
        return toTx(res.payment);
      },
    };
  }
  const amount = input.type === "bolt11" ? undefined : (amountSats ?? input.amountSats);
  if (input.type !== "bolt11" && !amount) throw new Error("Enter an amount");
  const prepared = await s.prepareSendPayment({
    paymentRequest: new PaymentRequest.Input({ input: input.type === "bolt11" ? input.raw : input.address }),
    amount,
    tokenIdentifier: undefined,
    conversionOptions: undefined,
    feePolicy: undefined,
  });
  const fee = quotedFeeSats(prepared.paymentMethod);
  return {
    amountSats: BigInt(prepared.amount),
    feeSats: fee,
    send: async () => {
      const options =
        input.type === "onchain"
          ? new SendPaymentOptions.BitcoinAddress({ confirmationSpeed: OnchainConfirmationSpeed.Medium })
          : undefined;
      const res = await s.sendPayment({ prepareResponse: prepared, options, idempotencyKey: undefined });
      return toTx(res.payment);
    },
  };
}

// -- USDT / USDC on other chains ---------------------------------------------

/** One way to move USDT or USDC between this wallet and another chain. */
export interface StableRoute {
  /** e.g. "USDT on Tron". */
  label: string;
  asset: string;
  chain: string;
  decimals: number;
  /** Smallest and largest amounts in dollars, when the provider says. */
  minUsd?: number;
  maxUsd?: number;
  /** Whether the route can pay out of (or into) dollars directly. */
  takesDollars: boolean;
  route: CrossChainRoutePair;
}

function toRoute(r: CrossChainRoutePair): StableRoute {
  const accepted = r.acceptedAssets.map((a) => ({ token: SparkAsset.Token.instanceOf(a.asset) ? a.asset.inner.tokenIdentifier : undefined, limits: a.limits }));
  const dollars = accepted.find((a) => a.token === USDB_TOKEN);
  const limits = (dollars ?? accepted[0])?.limits;
  const cents = (v: bigint | undefined) => (v === undefined ? undefined : Number(v) / 100);
  return {
    label: `${assetLabel(r.asset)} on ${chainLabel(r.chain)}`,
    asset: assetLabel(r.asset),
    chain: r.chain,
    decimals: r.decimals,
    minUsd: cents(limits?.minUsdCents),
    maxUsd: cents(limits?.maxUsdCents),
    takesDollars: !!dollars,
    route: r,
  };
}

/** USDT/USDC first, popular chains first, one entry per asset and chain. */
function tidy(routes: CrossChainRoutePair[]): StableRoute[] {
  const seen = new Set<string>();
  return routes
    .map(toRoute)
    .filter((r) => (r.asset === "USDT" || r.asset === "USDC") && !seen.has(r.label) && !!seen.add(r.label))
    .sort((a, b) => chainOrder(a.chain, b.chain) || a.asset.localeCompare(b.asset));
}

/** Ways someone can pay this wallet in USDT or USDC. */
export async function stablecoinReceiveRoutes(): Promise<StableRoute[]> {
  const s = await connect();
  return tidy(await s.getCrossChainRoutes(new CrossChainRouteFilter.Receive({ contractAddress: undefined })));
}

export interface StablecoinRequest {
  /** What the sender pays to: a bare address (Tron, Solana) or an EIP-681 URI. */
  paymentRequest: string;
  depositAddress: string;
  /** What to ask the sender for, in dollars (fees are on top of what you get). */
  sendUsd: number;
  sendAmount: string;
  expiresAt: number;
}

/**
 * A one-off address for someone to pay `usd` in USDT/USDC on `route`. It lands
 * as dollars when the wallet holds dollars, otherwise as bitcoin.
 */
export async function requestStablecoin(route: StableRoute, usd: string): Promise<StablecoinRequest> {
  const s = await connect();
  const res = await s.receivePayment({
    paymentMethod: new ReceivePaymentMethod.CrossChain({
      route: route.route,
      amount: toBaseUnits(usd, route.decimals),
      destination: undefined,
      feeMode: undefined,
      maxSlippageBps: undefined,
      targetOverpayBps: undefined,
    }),
  });
  const info = res.crossChainInfo;
  if (!info) throw new Error("No deposit address came back. Try again.");
  return {
    paymentRequest: res.paymentRequest,
    depositAddress: info.depositAddress,
    sendUsd: fromBaseUnits(BigInt(info.depositAmount), route.decimals),
    sendAmount: tokenAmount(BigInt(info.depositAmount), route.decimals),
    expiresAt: quoteExpiry(info.expiresAt),
  };
}

/** Ways to pay this USDT/USDC address. */
export async function stablecoinSendRoutes(input: Extract<ParsedInput, { type: "stablecoin" }>): Promise<StableRoute[]> {
  const s = await connect();
  return tidy(await s.getCrossChainRoutes(new CrossChainRouteFilter.Send({ addressDetails: input.details })));
}

export interface PreparedStablecoinSend {
  /** What the recipient should get, in dollars. */
  theyGetUsd: number;
  theyGetAmount: string;
  feeUsd: number;
  totalUsd: number;
  /** Paid from dollars when there are enough, otherwise from bitcoin. */
  from: "dollars" | "bitcoin";
  expiresAt: number;
  send: () => Promise<WalletTx>;
}

/** Pay `usd` in USDT/USDC to `input` over `route`. */
export async function prepareStablecoinSend(
  input: Extract<ParsedInput, { type: "stablecoin" }>,
  route: StableRoute,
  usd: string,
): Promise<PreparedStablecoinSend> {
  const s = await connect();
  const have = await balances();
  const fromDollars = route.takesDollars && have.usd >= Number(usd);
  if (!fromDollars && !usdPerBtc) await fiatRates();
  if (!fromDollars && !usdPerBtc) throw new Error("Couldn't get today's bitcoin price. Try again.");
  const prepared = await s.prepareSendPayment({
    paymentRequest: new PaymentRequest.CrossChain({ address: input.address, route: route.route, maxSlippageBps: undefined, targetOverpayBps: undefined }),
    amount: fromDollars ? toBaseUnits(usd, 6) : BigInt(Math.ceil((Number(usd) / usdPerBtc!) * 1e8)),
    tokenIdentifier: fromDollars ? USDB_TOKEN : undefined,
    conversionOptions: undefined,
    feePolicy: undefined,
  });
  const method = prepared.paymentMethod;
  if (!SendPaymentMethod.CrossChainAddress.instanceOf(method)) throw new Error("This address can't be paid in USDT or USDC");
  const q = method.inner;
  if (input.details.amount !== undefined && BigInt(q.estimatedOut) < BigInt(input.details.amount)) throw new Error("This quote would deliver less than the requested deposit. Request another quote.");
  if (q.sourceTransferFeeSats > 0n && !usdPerBtc) await fiatRates();
  if (q.sourceTransferFeeSats > 0n && !usdPerBtc) throw new Error("Couldn't calculate the transfer fee. Try again.");
  const sourceFeeUsd = Number(q.sourceTransferFeeSats) / 1e8 * (usdPerBtc ?? 0);
  return {
    theyGetUsd: fromBaseUnits(BigInt(q.estimatedOut), route.decimals),
    theyGetAmount: tokenAmount(BigInt(q.estimatedOut), route.decimals),
    feeUsd: fromBaseUnits(BigInt(q.feeAmount), route.decimals) + sourceFeeUsd,
    totalUsd: fromBaseUnits(BigInt(q.assetAmountIn), route.decimals) + sourceFeeUsd,
    from: fromDollars ? "dollars" : "bitcoin",
    expiresAt: quoteExpiry(q.expiresAt),
    send: async () => {
      const res = await s.sendPayment({ prepareResponse: prepared, options: undefined, idempotencyKey: undefined });
      return toTx(res.payment);
    },
  };
}

// -- HTLC escrow -------------------------------------------------------------

/** Deterministic UUID so a retried lock can never pay twice. */
export function idempotencyUuid(seed: string): string {
  const h = bytesToHex(sha256(utf8ToBytes(seed)));
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Recipient side of the escrow: a hold invoice the provider's payment will wait in. */
export async function holdInvoice(params: { amountSats: bigint; paymentHash: string; expirySecs: number; description: string }): Promise<string> {
  const s = await connect();
  const res = await s.receivePayment({
    paymentMethod: new ReceivePaymentMethod.Bolt11Invoice({
      description: params.description,
      amountSats: params.amountSats,
      expirySecs: Math.max(60, Math.floor(params.expirySecs)),
      paymentHash: params.paymentHash,
      receiverIdentityPublicKey: undefined,
    }),
  });
  return res.paymentRequest;
}

/**
 * Provider side of the escrow: pay the recipient's hold invoice, after
 * checking it is for exactly this amount and our payment hash. The payment
 * stays pending until the recipient claims it with our preimage.
 */
export async function payHoldInvoice(params: {
  bolt11: string;
  amountSats: bigint;
  paymentHash: string;
  idempotencySeed: string;
}): Promise<WalletTx> {
  const s = await connect();
  const prepared = await s.prepareSendPayment({
    paymentRequest: new PaymentRequest.Input({ input: params.bolt11 }),
    amount: undefined,
    tokenIdentifier: undefined,
    conversionOptions: undefined,
    feePolicy: undefined,
  });
  const method = prepared.paymentMethod;
  if (!SendPaymentMethod.Bolt11Invoice.instanceOf(method)) throw new Error("The lock invoice isn't a Lightning invoice");
  const invoice = method.inner.invoiceDetails;
  if (invoice.paymentHash !== params.paymentHash) throw new Error("The lock invoice is for a different payment hash");
  if (BigInt(invoice.amountMsat ?? 0n) !== params.amountSats * 1000n) throw new Error("The lock invoice is for the wrong amount");
  // Paying out of dollars converts first, and a converting payment can't carry an
  // idempotency key; the caller guards against paying twice instead (see lockAndSecure).
  const viaDollars = !!prepared.conversionEstimate;
  const res = await s.sendPayment({ prepareResponse: prepared, options: undefined, idempotencyKey: viaDollars ? undefined : idempotencyUuid(params.idempotencySeed) });
  return withHtlc(res.payment);
}

export async function claimHtlc(preimage: string): Promise<WalletTx> {
  const s = await connect();
  const res = await s.claimHtlcPayment({ preimage });
  return toTx(res.payment);
}

/** Find our side of an HTLC by payment hash, sent or received. */
export async function findHtlc(paymentHash: string, direction: "in" | "out"): Promise<WalletTx | null> {
  const s = await connect();
  await s.syncWallet({}).catch(() => undefined);
  const { payments } = await s.listPayments({
    typeFilter: [direction === "in" ? PaymentType.Receive : PaymentType.Send],
    statusFilter: undefined,
    assetFilter: undefined,
    paymentDetailsFilter: undefined,
    fromTimestamp: undefined,
    toTimestamp: undefined,
    offset: undefined,
    limit: 200,
    sortAscending: false,
  });
  const match = payments.map(withHtlc).find((t) => t.htlc?.paymentHash === paymentHash);
  return match ?? null;
}

/** A payment with its HTLC view, including Lightning hold-invoice payments. */
function withHtlc(p: Payment): WalletTx {
  const htlc = htlcOf(p);
  // A held Lightning payment that failed went back to its payer.
  return { ...toTx(p), htlc: htlc && p.status === PaymentStatus.Failed ? { ...htlc, status: "returned" } : htlc };
}
