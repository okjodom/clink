import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import React from "react";
import { View } from "react-native";

import { useMe, useMoney } from "../hooks";
import type { SwapItem } from "../hooks";
import { describeSwap, STEPS } from "../lib/swapView";
import { unreadCount, useSwaps } from "../store/swaps";
import type { WalletTx } from "../services/wallet";
import { Badge, Pulse, Row, Text, toneColors } from "./components";
import { space, useColors } from "./theme";

export function SwapRow({ item }: { item: SwapItem }) {
  const nav = useNavigation<any>();
  const me = useMe();
  const c = useColors();
  const view = describeSwap(item.rec, item.st, me);
  const unread = unreadCount(item.rec, me);
  const t = toneColors(c, view.tone);
  const adding = item.st.root.terms.direction === "fiat_to_btc";
  return (
    <Row
      onPress={() => nav.navigate("SwapDetail", { id: item.rec.id })}
      left={
        <View>
          <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: adding ? c.primarySoft : c.positiveSoft }}>
            <Feather name={adding ? "plus-circle" : "minus-circle"} size={22} color={adding ? c.primaryInk : c.positive} />
          </View>
          {view.myTurn && (
            <View style={{ position: "absolute", right: -6, top: -6 }}>
              <Pulse color={c.accent} size={8} />
            </View>
          )}
        </View>
      }
      title={view.title}
      subtitle={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.fg }} />
          <Text variant="caption" muted numberOfLines={1} style={{ flexShrink: 1 }}>
            {[item.rec.local.counterpartyName, view.headline].filter(Boolean).join(" · ")}
          </Text>
        </View>
      }
      right={unread ? <Badge label={String(unread)} tone="accent" icon="message-circle" /> : undefined}
      chevron
    />
  );
}

export function Steps({ step, tone }: { step: number; tone: "danger" | string }) {
  const c = useColors();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {STEPS.map((s, i) => (
          <View
            key={s}
            style={{
              flex: 1,
              height: 5,
              borderRadius: 3,
              backgroundColor: i <= step ? (tone === "danger" ? c.danger : c.primary) : c.border,
            }}
          />
        ))}
      </View>
      <Text variant="caption" faint>
        {step < 0 ? "Waiting to be accepted" : STEPS[Math.min(step, STEPS.length - 1)]}
      </Text>
    </View>
  );
}

/** Swap escrow payments carry "Pontmore swap <id prefix>"; other and older clients put their app name first. */
function useSwapOf(tx: WalletTx): { label: string; id?: string; adding: boolean } | null {
  const prefix = tx.description?.match(/^Pont(?:spark|more) swap ([0-9a-f]{8})$/)?.[1];
  const rec = useSwaps((s) => (prefix ? Object.values(s.records).find((r) => r.id.startsWith(prefix)) : undefined));
  if (!prefix) return null;
  const who = rec?.local.counterpartyName;
  const added = tx.direction === "in";
  // To an agent, money in means a customer cashed out with them, money out that one added money.
  if (rec?.role === "agent") return { id: rec.id, adding: !added, label: added ? `Cash out${who ? ` via ${who}` : ""}` : `Add money${who ? ` via ${who}` : ""}` };
  return {
    id: rec?.id,
    adding: added,
    label: who ? (added ? `Added via ${who}` : `Cashed out via ${who}`) : added ? "Added money" : "Cashed out",
  };
}

export function TxRow({ tx, hidden }: { tx: WalletTx; hidden?: boolean }) {
  const c = useColors();
  const nav = useNavigation<any>();
  const money = useMoney();
  const incoming = tx.direction === "in";
  const swap = useSwapOf(tx);
  const swapLabel = swap?.label;
  const label =
    swapLabel ??
    (tx.kind === "htlc"
      ? incoming
        ? tx.htlc?.status === "waiting"
          ? "On its way"
          : "Added money"
        : tx.htlc?.status === "returned"
          ? "Returned to you"
          : tx.htlc?.status === "waiting"
            ? "Set aside for cash out"
            : "Cashed out"
      : incoming ? "Received" : tx.recipient ? `Paid ${tx.recipient.split("@")[0]}` : "Sent");
  const swapPayment = !!swap || tx.kind === "htlc";
  const adding = swap?.adding ?? incoming;
  const icon: React.ComponentProps<typeof Feather>["name"] = swapPayment
    ? adding ? "plus-circle" : "minus-circle"
    : incoming ? "arrow-down" : "arrow-up";
  const date = new Date(tx.timestamp * 1000);
  return (
    <Row
      onPress={() => swap?.id ? nav.navigate("SwapDetail", { id: swap.id }) : nav.navigate("TransactionDetail", { id: tx.id })}
      icon={icon}
      iconBg={swapPayment ? adding ? c.primarySoft : c.positiveSoft : incoming ? c.positiveSoft : c.surfaceAlt}
      iconColor={swapPayment ? adding ? c.primaryInk : c.positive : incoming ? c.positive : c.text}
      title={label}
      subtitle={`${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}${tx.status === "pending" ? " · pending" : tx.status === "failed" ? " · failed" : ""}`}
      right={
        <View style={{ alignItems: "flex-end" }}>
          <Text variant="label" color={incoming ? c.positive : c.text}>
            {hidden ? "••••" : `${incoming ? "+" : "−"}${money.primary(tx.amountSats)}`}
          </Text>
        </View>
      }
      chevron
    />
  );
}

export function KeyValue({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.lg, paddingVertical: 4 }}>
      <Text variant="caption" muted>
        {label}
      </Text>
      {typeof value === "string" ? (
        <Text variant="label" style={[{ flexShrink: 1, textAlign: "right" }, mono && { fontVariant: ["tabular-nums"] }]}>
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}
