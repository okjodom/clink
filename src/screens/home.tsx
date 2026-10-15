import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { useActiveSwaps, useBackupNudge, useMe, useMoney, useNow, useSwapList, type SwapItem } from "../hooks";
import { describeSwap } from "../lib/swapView";
import { formatSats } from "../lib/money";
import { formatUsd } from "../lib/stablecoins";
import type { HoldIn } from "../services/wallet";
import { isTerminal } from "../protocol/swap";
import { useSession } from "../store/session";
import { useWallet } from "../store/wallet";
import { ActionTile, Button, Card, Collapsible, Empty, Notice, Screen, Section, Spinner, Text, success, tap } from "../ui/components";
import { Sheet, toast, toastError } from "../ui/extras";
import { SwapRow, TxRow } from "../ui/rows";
import { radius, space, useColors } from "../ui/theme";

/**
 * The money, and what you do with it. One number in your own
 * currency; where it's held (dollars or bitcoin) is a quiet chip above it.
 * Adding money and cashing out start from the cards below. Same card in both modes.
 */
export function WalletHero() {
  const c = useColors();
  const nav = useNavigation<any>();
  const { balance, status, holdIn } = useWallet();
  const hide = useSession((s) => s.hideBalance);
  const toggleHide = useSession((s) => s.toggleHideBalance);
  const money = useMoney();
  const [holdOpen, setHoldOpen] = useState(false);
  const shown = balance === null ? (status === "error" ? "—" : "…") : hide ? "••••••" : money.primary(balance);

  return (
    <View style={{ backgroundColor: c.hero, borderRadius: radius.xl, padding: space.xl, gap: space.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable
          onPress={() => {
            tap();
            setHoldOpen(true);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Held in ${holdIn}. Change`}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: "rgba(251,246,236,0.10)" }}
        >
          <Feather name={holdIn === "dollars" ? "dollar-sign" : "trending-up"} size={13} color={c.heroText} />
          <Text variant="caption" color={c.heroText} style={{ fontWeight: "600" }}>
            {holdIn === "dollars" ? "In dollars" : "In bitcoin"}
          </Text>
          <Feather name="chevron-down" size={13} color={c.heroMuted} />
        </Pressable>
        <Pressable
          onPress={() => {
            tap();
            toggleHide();
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={hide ? "Show balance" : "Hide balance"}
        >
          <Feather name={hide ? "eye-off" : "eye"} size={18} color={c.heroMuted} />
        </Pressable>
      </View>
      <Pressable
        onPress={() => {
          tap();
          toggleHide();
        }}
        accessibilityRole="button"
        accessibilityLabel={hide ? "Balance hidden" : `Balance ${shown}`}
        accessibilityHint={hide ? "Shows your balance" : "Hides your balance"}
      >
        <Text variant="hero" color={balance === null ? c.heroMuted : c.heroText} adjustsFontSizeToFit numberOfLines={1} style={{ fontSize: 48, lineHeight: 56 }}>
          {shown}
        </Text>
      </Pressable>
      <View style={{ flexDirection: "row" }}>
        <ActionTile tone="hero" icon="arrow-down" label="Receive" onPress={() => nav.navigate("Receive")} />
        <ActionTile tone="hero" icon="arrow-up" label="Send" onPress={() => nav.navigate("Send")} />
        <ActionTile tone="hero" icon="maximize" label="Scan" onPress={() => nav.navigate("Scan")} />
      </View>
      <HoldInSheet visible={holdOpen} onClose={() => setHoldOpen(false)} />
    </View>
  );
}

/** The one swap waiting on you, front and centre, so coming back to the app picks up where it left off. */
function YourTurn({ items }: { items: SwapItem[] }) {
  const nav = useNavigation<any>();
  const c = useColors();
  const me = useMe();
  const now = useNow(15000);
  const next = items.map((i) => ({ i, view: describeSwap(i.rec, i.st, me, now) })).find((x) => x.view.myTurn);
  if (!next) return null;
  return (
    <Card tone="primary" onPress={() => nav.navigate("SwapDetail", { id: next.i.rec.id })} style={{ flexDirection: "row", alignItems: "center" }}>
      <Feather name="bell" size={22} color={c.primaryInk} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">{next.view.headline}</Text>
        <Text variant="caption" muted numberOfLines={2}>
          {next.view.detail}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={c.textMuted} />
    </Card>
  );
}

const HOLD_OPTIONS: { value: HoldIn; title: string; body: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
  { value: "dollars", title: "Dollars", body: "Stays steady. $10 today is $10 next month.", icon: "dollar-sign" },
  { value: "bitcoin", title: "Bitcoin", body: "Goes up and down with bitcoin's price.", icon: "trending-up" },
];

/** One choice: keep the balance steady in dollars, or in bitcoin. */
function HoldInSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const { holdIn, setHoldIn, sats, usd } = useWallet();
  // What's sitting there now, in its own terms.
  const have = holdIn === "dollars" ? formatUsd(usd) : sats === null ? null : formatSats(sats);
  const [busy, setBusy] = useState<HoldIn | null>(null);
  const choose = async (to: HoldIn) => {
    if (to === holdIn) return onClose();
    setBusy(to);
    try {
      await setHoldIn(to);
      success();
      toast(to === "dollars" ? "Your money is now in dollars" : "Your money is now in bitcoin", "success");
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Keep your money in">
      {HOLD_OPTIONS.map((o) => {
        const on = o.value === holdIn;
        return (
          <Card key={o.value} tone={on ? "primary" : "alt"} onPress={busy ? undefined : () => void choose(o.value)} style={{ flexDirection: "row", alignItems: "center" }}>
            <Feather name={o.icon} size={22} color={on ? c.primaryInk : c.text} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label">{o.title}</Text>
              <Text variant="caption" muted>
                {on && have ? `${o.body} You have ${have}.` : o.body}
              </Text>
            </View>
            {busy === o.value ? <ActivityIndicator color={c.primaryInk} /> : on ? <Feather name="check" size={20} color={c.primaryInk} /> : null}
          </Card>
        );
      })}
      <Text variant="caption" muted center>
        Switching moves what you have now. Sending, receiving and cashing out work the same either way.
      </Text>
    </Sheet>
  );
}

export function HomeScreen() {
  const nav = useNavigation<any>();
  const c = useColors();
  const { txs, status, error, refresh, refreshRates, balance } = useWallet();
  const nudge = useBackupNudge();
  const name = useSession((s) => s.profile.name);
  const hide = useSession((s) => s.hideBalance);
  const mode = useSession((s) => s.mode);
  const active = useActiveSwaps(mode === "agent" ? undefined : "customer");
  const money = useMoney();
  const [refreshing, setRefreshing] = useState(false);

  return (
    <Screen
      onRefresh={async () => {
        setRefreshing(true);
        await Promise.all([refresh(), refreshRates()]);
        setRefreshing(false);
      }}
      refreshing={refreshing}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.sm }}>
        <View>
          <Text variant="caption" muted>
            {mode === "agent" ? "Agent wallet" : greeting()}
          </Text>
          <Text variant="title">{name || "Your wallet"}</Text>
        </View>
      </View>

      <WalletHero />

      {status === "error" && (
        <Notice tone="danger" title="Wallet offline" action={<Button small kind="secondary" title="Retry" onPress={() => useWallet.getState().start()} />}>
          {error ?? "Couldn't connect to the wallet."}
        </Notice>
      )}

      {nudge && balance !== null && (
        <Card tone="accent" onPress={() => nav.navigate("Backup")} style={{ flexDirection: "row", alignItems: "center" }}>
          <Feather name="shield" size={22} color={c.accent} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label">Protect your {hide ? "money" : money.primary(balance)}</Text>
            <Text variant="caption" muted>
              Write down 12 words. If you lose your phone, they bring your money back.
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={c.textMuted} />
        </Card>
      )}

      {mode === "user" && (
        <View style={{ flexDirection: "row", gap: space.md }}>
          <Card style={{ flex: 1, flexBasis: 0, minWidth: 0 }} onPress={() => nav.navigate("NewSwap", { direction: "fiat_to_btc" })}>
            <Feather name="plus-circle" size={22} color={c.primaryInk} />
            <Text variant="heading">Add money</Text>
            <Text variant="caption" muted>
              From mobile money, bank or cash
            </Text>
          </Card>
          <Card style={{ flex: 1, flexBasis: 0, minWidth: 0 }} onPress={() => nav.navigate("NewSwap", { direction: "btc_to_fiat" })}>
            <Feather name="minus-circle" size={22} color={c.positive} />
            <Text variant="heading">Cash out</Text>
            <Text variant="caption" muted>
              To mobile money, bank or cash
            </Text>
          </Card>
        </View>
      )}

      <YourTurn items={active} />

      {active.length > 0 && (
        <Section title="In progress">
          <Card style={{ paddingVertical: space.sm, gap: 0 }}>
            {active.slice(0, 4).map((i) => (
              <SwapRow key={i.rec.id} item={i} />
            ))}
          </Card>
        </Section>
      )}

      <Section
        title="Activity"
        action={
          txs.length > 0 ? (
            <Pressable onPress={() => nav.navigate("Transactions")}>
              <Text variant="label" color={c.primaryInk}>
                See all
              </Text>
            </Pressable>
          ) : undefined
        }
      >
        {status === "connecting" && txs.length === 0 ? (
          <Spinner label="Opening your wallet…" />
        ) : txs.length === 0 ? (
          <Empty icon="inbox" title="Nothing here yet" body="Share your username to get paid, or add money through an agent." />
        ) : (
          <Card style={{ paddingVertical: space.sm, gap: 0 }}>
            {txs.slice(0, 6).map((t) => (
              <TxRow key={t.id} tx={t} hidden={hide} />
            ))}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

/** Everything that moved: swaps in progress, payments, then finished swaps. */
export function TransactionsScreen() {
  const { txs, refresh } = useWallet();
  const hide = useSession((s) => s.hideBalance);
  const mode = useSession((s) => s.mode);
  const swaps = useSwapList((i) => mode === "agent" || i.rec.role === "customer");
  const active = useActiveSwaps(mode === "agent" ? undefined : "customer");
  const activeIds = new Set(active.map((i) => i.rec.id));
  const past: SwapItem[] = swaps.filter((i) => !activeIds.has(i.rec.id) && isTerminal(i.st));
  const [refreshing, setRefreshing] = useState(false);
  return (
    <Screen
      back
      title="Activity"
      onRefresh={async () => {
        setRefreshing(true);
        await refresh();
        setRefreshing(false);
      }}
      refreshing={refreshing}
    >
      {active.length > 0 && (
        <Section title="In progress">
          <Card style={{ paddingVertical: space.sm, gap: 0 }}>
            {active.map((i) => (
              <SwapRow key={i.rec.id} item={i} />
            ))}
          </Card>
        </Section>
      )}
      {txs.length === 0 ? (
        <Empty icon="inbox" title="No payments yet" />
      ) : (
        <Card style={{ paddingVertical: space.sm, gap: 0 }}>
          {txs.map((t) => (
            <TxRow key={t.id} tx={t} hidden={hide} />
          ))}
        </Card>
      )}
      {past.length > 0 && (
        <Collapsible title="Past swaps" summary={`${past.length}`}>
          <Card style={{ paddingVertical: space.sm, gap: 0 }}>
            {past.map((i) => (
              <SwapRow key={i.rec.id} item={i} />
            ))}
          </Card>
        </Collapsible>
      )}
    </Screen>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
