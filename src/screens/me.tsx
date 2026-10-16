import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import Constants from "expo-constants";
import React, { useState } from "react";
import { Linking, ScrollView, View } from "react-native";

import { BRAND } from "../brand";

import { useNow, useSwapList } from "../hooks";
import { currencyInfo, CURRENCIES } from "../lib/channels";
import { npub } from "../lib/links";
import { isTerminal } from "../protocol/swap";
import { BREEZ_NETWORK } from "../services/config";
import { publish, relayStatus, sign } from "../services/nostr";
import { profileTemplate } from "../protocol/events";
import { useAgent } from "../store/agent";
import { useSession } from "../store/session";
import { useSwaps } from "../store/swaps";
import { useWallet } from "../store/wallet";
import { Avatar, Badge, Button, Card, Divider, Empty, Field, Notice, Row, Screen, Section, Segmented, Text, Toggle, success } from "../ui/components";
import { CopyField, Sheet, confirm, toast } from "../ui/extras";
import { SwapRow } from "../ui/rows";
import { space, useColors } from "../ui/theme";
import { UsernameShareButton } from "../ui/usernameShare";
import { useConfirmLeaveAgent } from "./agent";
import { ClaimAddressSheet } from "./receive";
import { setAgentOnline } from "../services/agentLoop";

export function ActivityScreen() {
  const nav = useNavigation<any>();
  const now = useNow(30000);
  const mode = useSession((s) => s.mode);
  const [tab, setTab] = useState<"active" | "past">("active");
  const list = useSwapList((i) => (mode === "agent" ? true : i.rec.role === "customer"));
  const isActive = (st: (typeof list)[number]["st"]) => !isTerminal(st) && !(st.status === "proposed" && now >= st.root.expiresAt);
  const shown = list.filter((i) => (tab === "active" ? isActive(i.st) : !isActive(i.st)));
  return (
    <Screen back title="All swaps">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "active", label: "Active" },
          { value: "past", label: "Past" },
        ]}
      />
      {shown.length === 0 ? (
        <Empty
          icon="repeat"
          title={tab === "active" ? "No active swaps" : "No past swaps"}
          body={mode === "agent" ? "Requests you take appear here." : "Add money or cash out with an agent near you."}
          action={
            mode === "agent" ? undefined : (
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <Button small title="Add money" onPress={() => nav.navigate("NewSwap", { direction: "fiat_to_btc" })} />
                <Button small kind="secondary" title="Cash out" onPress={() => nav.navigate("NewSwap", { direction: "btc_to_fiat" })} />
              </View>
            )
          }
        />
      ) : (
        <Card style={{ paddingVertical: space.sm, gap: 0 }}>
          {shown.map((i) => (
            <SwapRow key={i.rec.id} item={i} />
          ))}
        </Card>
      )}
    </Screen>
  );
}

export function MeScreen() {
  const nav = useNavigation<any>();
  const c = useColors();
  const { keys, profile, mode, setMode, backedUp, currency, setCurrency, setProfile, preferSats, togglePreferSats } = useSession();
  const configured = useAgent((s) => s.configured);
  const lnAddress = useWallet((s) => s.lightningAddress);
  const leaveAgent = useConfirmLeaveAgent();
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [name, setName] = useState(profile.name);
  if (!keys) return null;

  return (
    <Screen
      large
      title="Profile"
      right={<UsernameShareButton />}
    >
      <Card style={{ flexDirection: "row", alignItems: "center" }} onPress={() => setNameOpen(true)}>
        <Avatar pk={keys.identity.pk} name={profile.name} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">{profile.name || "Add your name"}</Text>
          <Text variant="caption" muted numberOfLines={1}>
            {lnAddress ?? "No username yet"}
          </Text>
        </View>
        <Feather name="edit-2" size={16} color={c.textMuted} />
      </Card>

      {!lnAddress && (
        <Button kind="secondary" icon="at-sign" title="Pick a username" onPress={() => setClaimOpen(true)} />
      )}

      <Card tone={mode === "agent" ? "primary" : "positive"}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <Feather name={mode === "agent" ? "user" : "trending-up"} size={22} color={mode === "agent" ? c.primaryInk : c.positive} />
          <View style={{ flex: 1 }}>
            <Text variant="heading">{mode === "agent" ? "Switch to personal mode" : configured ? "Switch to agent mode" : "Earn as an agent"}</Text>
            <Text variant="caption" muted>
              {mode === "agent" ? "Use your wallet like everyone else." : "Help people near you add money and cash out, and earn on every swap."}
            </Text>
          </View>
        </View>
        <Button
          small
          kind={mode === "agent" ? "secondary" : "positive"}
          title={mode === "agent" ? "Personal mode" : configured ? "Agent mode" : "Start earning"}
          onPress={() => {
            if (mode === "agent") return leaveAgent();
            if (!configured) return nav.navigate("AgentSetup");
            setMode("agent");
            success();
          }}
        />
      </Card>

      <Section title="Settings">
        <Card style={{ paddingVertical: space.sm, gap: 0 }}>
          <Row
            icon="shield"
            title="Recovery words"
            subtitle={backedUp ? "Written down" : "Not written down yet"}
            right={backedUp ? <Badge label="Safe" tone="success" /> : <Badge label="Do this" tone="warning" />}
            chevron
            onPress={() => nav.navigate("Backup")}
          />
          <Divider />
          <Row
            icon="dollar-sign"
            title="Your currency"
            subtitle={`${currencyInfo(currency).flag} ${currency}`}
            chevron
            onPress={() => setCurrencyOpen(true)}
          />
          <Divider />
          <Toggle icon="hash" label="Show amounts in sats" subtitle="Bitcoin's smallest unit" value={preferSats} onChange={togglePreferSats} />
          <Divider />
          <Row icon="list" title="Activity" subtitle="Payments and swaps" chevron onPress={() => nav.navigate("Transactions")} />
          <Divider />
          <Row icon="users" title="People" subtitle="Your private contact index" chevron onPress={() => nav.navigate("Contacts")} />
        </Card>
      </Section>

      <Card tone="alt" onPress={() => nav.navigate("Advanced")} style={{ flexDirection: "row", alignItems: "center" }}>
        <Feather name="key" size={20} color={c.primaryInk} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">Your keys, your money</Text>
          <Text variant="caption" muted>
            How {BRAND.name} works without a bank, and the controls that prove it.
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={c.textMuted} />
      </Card>

      <Sheet visible={currencyOpen} onClose={() => setCurrencyOpen(false)} title="Your currency">
        <ScrollView style={{ maxHeight: 420 }}>
          {CURRENCIES.map((cur) => (
            <Row
              key={cur.code}
              left={<Text variant="title">{cur.flag}</Text>}
              title={`${cur.code} · ${cur.name}`}
              right={cur.code === currency ? <Feather name="check" size={18} color={c.primaryInk} /> : undefined}
              onPress={() => {
                setCurrency(cur.code);
                setCurrencyOpen(false);
              }}
            />
          ))}
        </ScrollView>
      </Sheet>
      <Sheet visible={nameOpen} onClose={() => setNameOpen(false)} title="Your name">
        <Field value={name} onChangeText={setName} placeholder="What people see" maxLength={48} autoFocus />
        <Button
          title="Save"
          onPress={() => {
            const next = { ...profile, name: name.trim() };
            setProfile(next);
            setNameOpen(false);
            // Lets counterparties see who they're swapping with.
            void publish(sign(profileTemplate({ name: next.name, about: next.about, lud16: lnAddress ?? undefined }), keys.identity.sk)).catch(() => undefined);
          }}
        />
      </Sheet>
      <ClaimAddressSheet visible={claimOpen} onClose={() => setClaimOpen(false)} />
    </Screen>
  );
}

/**
 * Self-custody, made visible for whoever goes looking: no bank, no account,
 * keys on this phone, swaps on a public protocol.
 */
export function AdvancedScreen() {
  const nav = useNavigation<any>();
  const c = useColors();
  const keys = useSession((s) => s.keys);
  const backedUp = useSession((s) => s.backedUp);
  if (!keys) return null;
  const facts: { icon: React.ComponentProps<typeof Feather>["name"]; title: string; body: string }[] = [
    { icon: "smartphone", title: "Your money lives on this phone", body: `Not with ${BRAND.name}, not with a bank. Nobody can freeze it or spend it but you.` },
    { icon: "lock", title: "Swaps can't run off with it", body: "When you cash out, your bitcoin is locked, not sent. It only moves once you have the cash, or it comes back to you." },
    { icon: "globe", title: "No company in the middle", body: "Agents and customers meet on an open network. No account, no sign-up, no server of ours." },
  ];
  return (
    <Screen back title="Your keys, your money">
      <View style={{ gap: space.lg }}>
        {facts.map((f) => (
          <View key={f.title} style={{ flexDirection: "row", gap: space.md }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" }}>
              <Feather name={f.icon} size={18} color={c.primaryInk} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label">{f.title}</Text>
              <Text variant="caption" muted>
                {f.body}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Section title="Controls">
        <Card style={{ paddingVertical: space.sm, gap: 0 }}>
          <Row icon="shield" title="Recovery words" subtitle={backedUp ? "Written down" : "Not written down yet"} chevron onPress={() => nav.navigate("Backup")} />
          <Divider />
          <Row icon="key" title="Your ID" subtitle={`${npub(keys.identity.pk).slice(0, 18)}…`} chevron onPress={() => nav.navigate("Identity")} />
          <Divider />
          <Row icon="radio" title="Network" subtitle="Where offers, swaps and messages travel" chevron onPress={() => nav.navigate("Relays")} />
          <Divider />
          <Row icon="map-pin" title="Browse agents" subtitle="Every agent online for your currency" chevron onPress={() => nav.navigate("Agents")} />
        </Card>
      </Section>

      <Section title="Under the hood">
        <Card style={{ paddingVertical: space.sm, gap: 0 }}>
          <Row icon="book-open" title="How swaps work" subtitle="The open rules every swap follows" chevron onPress={() => void Linking.openURL("https://github.com/pontmore/protocol")} />
          <Divider />
          <Row icon="zap" title="Wallet" subtitle={BREEZ_NETWORK === "mainnet" ? "Only you hold the keys" : `Only you hold the keys · ${BREEZ_NETWORK}`} />
          <Divider />
          <Row icon="cpu" title="Version" subtitle={Constants.expoConfig?.version ?? "dev"} />
        </Card>
      </Section>

      <Button kind="danger" title="Remove wallet from this phone" icon="log-out" onPress={() => nav.navigate("SignOut")} />
    </Screen>
  );
}

export function IdentityScreen() {
  const keys = useSession((s) => s.keys);
  if (!keys) return null;
  return (
    <Screen back title="Your ID">
      <Text muted>
        Your ID comes from your 12 words, so restoring your wallet brings it back. Agent mode uses two more keys, also made from your words.
      </Text>
      <CopyField value={npub(keys.identity.pk)} label="Your ID" />
      <CopyField value={npub(keys.escrow.pk)} label="Escrow key (agent mode)" short />
      <CopyField value={npub(keys.resolver.pk)} label="Resolver key (agent mode)" short />
      <Notice tone="info">The escrow key signs your agent's locks, payouts and refunds. The resolver key signs decisions on disputes.</Notice>
    </Screen>
  );
}

export function RelaysScreen() {
  const { relays, setRelays } = useSession();
  const [list, setList] = useState(relays);
  const [input, setInput] = useState("");
  const status = relayStatus();
  const c = useColors();
  return (
    <Screen
      back
      title="Network"
      footer={
        <Button
          title="Save"
          onPress={() => {
            setRelays(list);
            toast("Saved. Restart the app to reconnect.", "success");
          }}
        />
      }
    >
      <Text muted>Your offers, swaps and private messages travel through these servers. Both sides of a swap need at least one in common.</Text>
      <Card style={{ paddingVertical: space.sm, gap: 0 }}>
        {list.map((r) => (
          <Row
            key={r}
            icon="radio"
            iconColor={status.get(r) ? c.positive : undefined}
            title={r.replace("wss://", "")}
            subtitle={status.get(r) ? "Connected" : "Not connected"}
            right={<Button small kind="ghost" title="Remove" onPress={() => setList(list.filter((x) => x !== r))} />}
          />
        ))}
      </Card>
      <Field value={input} onChangeText={setInput} placeholder="wss://relay.example.com" autoCapitalize="none" autoCorrect={false} />
      <Button
        kind="secondary"
        title="Add server"
        disabled={!/^wss:\/\/[^\s]+\.[^\s]+$/.test(input.trim())}
        onPress={() => {
          setList([...new Set([...list, input.trim()])]);
          setInput("");
        }}
      />
    </Screen>
  );
}

export function SignOutScreen() {
  const nav = useNavigation<any>();
  const signOut = useSession((s) => s.signOut);
  const balance = useWallet((s) => s.balance);
  const backedUp = useSession((s) => s.backedUp);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Screen
      back
      title="Remove wallet"
      footer={
        <Button
          kind="danger"
          title="Remove from this phone"
          disabled={typed.trim().toLowerCase() !== "remove" || busy}
          loading={busy}
          onPress={async () => {
            const ok = await confirm({
              title: "Remove wallet?",
              message: "Without your 12 words, this wallet is gone for good.",
              confirmLabel: "Remove wallet",
              cancelLabel: "Keep it",
              tone: "danger",
              icon: "trash-2",
            });
            if (!ok) return;
            setBusy(true);
            if (useAgent.getState().online) await setAgentOnline(false).catch(() => undefined);
            useAgent.getState().reset();
            useSwaps.getState().clear();
            useWallet.getState().reset();
            await signOut();
          }}
        />
      }
    >
      <Notice tone="danger" title="This removes your wallet from this phone">
        {`Only your 12 words can bring it back.${balance ? ` This wallet holds ${balance.toLocaleString()} sats.` : ""}`}
      </Notice>
      {!backedUp && (
        <Notice tone="warning" title="You haven't backed up" action={<Button small kind="secondary" title="Back up first" onPress={() => nav.navigate("Backup")} />}>
          Back up first, or you'll lose this wallet.
        </Notice>
      )}
      <Field label='Type "remove" to confirm' value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} />
    </Screen>
  );
}
