import { Feather } from "@expo/vector-icons";
import { useRoute } from "@react-navigation/native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";

import { useMoney } from "../hooks";
import { errorText } from "../lib/errors";
import { formatSats } from "../lib/money";
import { formatUsd } from "../lib/stablecoins";
import { getTransaction, onWalletEvent, type WalletTx } from "../services/wallet";
import { useWallet } from "../store/wallet";
import { Badge, Button, Card, Collapsible, Notice, Screen, Spinner, Text } from "../ui/components";
import { CopyField, toastError } from "../ui/extras";
import { KeyValue } from "../ui/rows";
import { space, useColors } from "../ui/theme";

const kindLabel: Record<WalletTx["kind"], string> = { lightning: "Lightning", spark: "Spark", onchain: "Bitcoin on-chain", htlc: "Swap payment", other: "Wallet payment" };

export function TransactionDetailScreen() {
  const { id } = useRoute<any>().params as { id: string };
  const c = useColors();
  const money = useMoney();
  const cached = useWallet((s) => s.txs.find((tx) => tx.id === id || (id.startsWith("bitcoin-deposit:") && tx.direction === "in" && tx.blockchainTxId === id.split(":")[1] && tx.blockchainVout === Number(id.split(":")[2]))));
  const [tx, setTx] = useState<WalletTx | undefined>(cached);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    const version = ++request.current;
    setRefreshing(true);
    try {
      const current = await getTransaction(id);
      if (version === request.current) { setTx(current); setError(null); }
    } catch (cause) { if (version === request.current) setError(errorText(cause)); }
    finally { if (version === request.current) setRefreshing(false); }
  }, [id]);
  useEffect(() => {
    void load();
    const unsubscribe = onWalletEvent((event) => {
      if (event.type === "payment" && event.payment.id === id) { request.current++; setRefreshing(false); setTx(event.payment); setError(null); }
    });
    return () => { request.current++; unsubscribe(); };
  }, [id, load]);
  useEffect(() => { if (cached) setTx(cached); }, [cached]);

  if (!tx) return <Screen back title="Transaction">
    {error ? <Notice tone="danger" title="Couldn't load this payment" action={<Button small title="Retry" onPress={load} />}>{error}</Notice> : <Spinner label="Loading transaction…" />}
  </Screen>;
  const incoming = tx.direction === "in";
  const complete = tx.status === "complete";
  const failed = tx.status === "failed";
  const status = tx.statusLabel ?? (complete ? "Completed" : failed ? "Failed" : "Pending");
  const amount = tx.usd === undefined ? money.primary(tx.amountSats) : formatUsd(tx.usd);
  const bitcoinFee = `${money.primary(tx.feeSats)} · ${formatSats(tx.feeSats)}`;
  const dollarFee = tx.feeUsd ? `$${tx.feeUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}` : "Free";
  const date = new Date(tx.timestamp * 1000);
  return <Screen back title="Transaction" onRefresh={load} refreshing={refreshing}>
    <View style={{ alignItems: "center", gap: space.md, paddingVertical: space.xl }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: failed ? c.dangerSoft : incoming ? c.positiveSoft : c.surfaceAlt }}>
        <Feather name={incoming ? "arrow-down" : "arrow-up"} size={30} color={failed ? c.danger : incoming ? c.positive : c.text} />
      </View>
      <Text variant="heading">{incoming ? "Received" : "Sent"}</Text>
      <Text variant="display" adjustsFontSizeToFit numberOfLines={1}>{amount}</Text>
      {tx.usd === undefined && <Text muted>{formatSats(tx.amountSats)}</Text>}
      <View style={{ alignSelf: "center" }}><Badge label={status} tone={failed ? "danger" : complete ? "success" : "info"} /></View>
    </View>
    {error && <Notice tone="warning" title="Showing the last available details" action={<Button small kind="secondary" title="Retry" onPress={load} />}>{error}</Notice>}
    {tx.pendingReason && <Notice tone="info" title={status}>{tx.pendingReason}</Notice>}
    <Card>
      {tx.recipient && <KeyValue label="To" value={tx.recipient} />}
      <KeyValue label={tx.detectedAt ? "Detected on" : "Date"} value={date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} />
      <KeyValue label="Time" value={date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })} />
      <KeyValue label="Network" value={tx.network ?? kindLabel[tx.kind]} />
      {tx.externalAmount && <KeyValue label={complete ? "Delivered" : "Estimated delivery"} value={tx.externalAmount} />}
      {!incoming && tx.network && <KeyValue label="Bridge fee (included)" value={tx.externalFee ?? "Unavailable"} />}
      {!incoming && (!tx.network || tx.feeSats > 0n || (tx.feeUsd ?? 0) > 0) && <KeyValue label={tx.network ? "Other fees" : "Fee"} value={tx.usd === undefined ? tx.feeSats === 0n ? "Free" : bitcoinFee : dollarFee} />}
      {!incoming && <KeyValue label="Total" value={tx.usd === undefined ? `${money.primary(tx.amountSats + tx.feeSats)} · ${formatSats(tx.amountSats + tx.feeSats)}` : formatUsd(tx.usd + (tx.feeUsd ?? 0))} />}
    </Card>
    {tx.description && <Card><Text variant="caption" muted>Description</Text><Text selectable>{tx.description}</Text></Card>}
    <CopyField value={tx.id} label="Transaction ID" short />
    {tx.blockchainTxId && <CopyField value={tx.blockchainTxId} label="Blockchain transaction ID" short />}
    {tx.explorerUrl && <Button kind="secondary" title="View on explorer" icon="external-link" onPress={() => void Linking.openURL(tx.explorerUrl!).catch(toastError)} />}
    {tx.invoice && <Collapsible title="Payment request"><CopyField value={tx.invoice} label="Invoice" short /></Collapsible>}
  </Screen>;
}
