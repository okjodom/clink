import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import React, { useState } from "react";
import { Pressable, View } from "react-native";

import { useActiveSwaps, useBackupNudge, useMoney, useSwapList, type SwapItem } from "../hooks";
import { isTerminal } from "../protocol/swap";
import { useSession } from "../store/session";
import { useWallet } from "../store/wallet";
import { ActionTile, Button, Card, Collapsible, Empty, Notice, Screen, Section, Spinner, Text, tap } from "../ui/components";
import { SwapRow, TxRow } from "../ui/rows";
import { radius, space, useColors } from "../ui/theme";

/** Same card in both modes: adding money and cashing out start from the cards below it. */
export function WalletHero() {
  const c = useColors();
  const nav = useNavigation<any>();
  const { balance, status } = useWallet();
  const hide = useSession((s) => s.hideBalance);
  const toggleHide = useSession((s) => s.toggleHideBalance);
  const toggleUnit = useSession((s) => s.togglePreferSats);
  const money = useMoney();
  const other = balance !== null ? money.secondary(balance) : null;

  return (
    <View style={{ backgroundColor: c.hero, borderRadius: radius.xl, padding: space.xl, gap: space.xl }}>
      <View style={{ gap: 4 }}>
        <Pressable onPress={toggleHide} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
          <Text variant="caption" color={c.heroMuted}>
            Balance
          </Text>
          <Feather name={hide ? "eye-off" : "eye"} size={13} color={c.heroMuted} />
        </Pressable>
        {balance === null ? (
          <Text variant="hero" color={c.heroMuted}>
            {status === "error" ? "—" : "…"}
          </Text>
        ) : (
          <Pressable
            onPress={() => {
              if (!other || hide) return;
              tap();
              toggleUnit();
            }}
            accessibilityHint={other ? "Switches between your currency and sats" : undefined}
            style={{ gap: 4 }}
          >
            <Text variant="hero" color={c.heroText} adjustsFontSizeToFit numberOfLines={1}>
              {hide ? "••••••" : money.primary(balance)}
            </Text>
            {other && !hide && (
              <Text variant="body" color={c.heroMuted}>
                {other}
              </Text>
            )}
          </Pressable>
        )}
      </View>
      <View style={{ flexDirection: "row" }}>
        <ActionTile tone="hero" icon="arrow-down" label="Receive" onPress={() => nav.navigate("Receive")} />
        <ActionTile tone="hero" icon="arrow-up" label="Send" onPress={() => nav.navigate("Send")} />
        <ActionTile tone="hero" icon="maximize" label="Scan" onPress={() => nav.navigate("Scan")} />
      </View>
    </View>
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
              Write down 12 words so you can never lose it, even if you lose this phone.
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={c.textMuted} />
        </Card>
      )}

      {mode === "user" && (
        <View style={{ flexDirection: "row", gap: space.md }}>
          <Card style={{ flex: 1, flexBasis: 0, minWidth: 0 }} onPress={() => nav.navigate("NewSwap", { direction: "fiat_to_btc" })}>
            <Feather name="plus-circle" size={22} color={c.primary} />
            <Text variant="heading">Add money</Text>
            <Text variant="caption" muted>
              From M-Pesa, mobile money or cash
            </Text>
          </Card>
          <Card style={{ flex: 1, flexBasis: 0, minWidth: 0 }} onPress={() => nav.navigate("NewSwap", { direction: "btc_to_fiat" })}>
            <Feather name="minus-circle" size={22} color={c.accent} />
            <Text variant="heading">Cash out</Text>
            <Text variant="caption" muted>
              To M-Pesa, mobile money or cash
            </Text>
          </Card>
        </View>
      )}

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
              <Text variant="label" color={c.primary}>
                See all
              </Text>
            </Pressable>
          ) : undefined
        }
      >
        {status === "connecting" && txs.length === 0 ? (
          <Spinner label="Opening your wallet…" />
        ) : txs.length === 0 ? (
          <Empty icon="inbox" title="Nothing here yet" body="Share your username to get paid, or add money from M-Pesa." />
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
