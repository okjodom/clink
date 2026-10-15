import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import React, { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";

import { BRAND } from "../brand";
import { useActiveSwaps, useMoney, useNow, useSwapList } from "../hooks";
import { earningsIn } from "../lib/earnings";
import { channelInfo, channelsForCurrency, currencyInfo, CURRENCIES, detailsComplete, validateDetails, type ChannelDetails } from "../lib/channels";
import { formatDecimal, isDecimalAmount } from "../lib/money";
import { timeAgo } from "../lib/swapView";
import { buildOffers, type MarketOffers } from "../services/agentPublisher";
import { defaultMarket, useAgent, type Market, type MarketSide } from "../store/agent";
import { useSession } from "../store/session";
import { useWallet } from "../store/wallet";
import { Badge, Button, Card, Chip, Collapsible, Empty, Field, IconButton, Notice, Pulse, Row, Screen, Section, Text, Toggle, success } from "../ui/components";
import { Sheet, confirm, toast } from "../ui/extras";
import { ChannelFields } from "../ui/channelFields";
import { SwapRow } from "../ui/rows";
import { radius, space, useColors } from "../ui/theme";
import { AgentShareSheet } from "./discover";
import { setAgentOnline } from "../services/agentLoop";

/**
 * The agent desk, in Clink terms: you help people add money and cash out,
 * and earn a small fee each time. One card says whether you're online and
 * what you've earned; requests and your offer sit below it.
 */
export function DeskScreen() {
  const nav = useNavigation<any>();
  const c = useColors();
  const { configured, online, markets, lastPublishedAt, publishError, autoAccept } = useAgent();
  const keys = useSession((s) => s.keys);
  const name = useSession((s) => s.profile.name);
  const balance = useWallet((s) => s.balance);
  const money = useMoney();
  const active = useActiveSwaps("agent");
  const all = useSwapList((i) => i.rec.role === "agent");
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const requests = active.filter((i) => i.st.status === "proposed");
  const running = active.filter((i) => i.st.status !== "proposed");
  const completed = all.filter((i) => i.st.status === "settled");
  const now = useNow(60_000);
  const earnCurrency = markets[0]?.currency ?? "KES";
  const earned = useMemo(() => earningsIn(completed, earnCurrency, now), [completed, earnCurrency, now]);

  if (!configured) {
    return (
      <Screen large title="Agent desk">
        <Empty
          icon="briefcase"
          title="Help people add money and cash out"
          body="Earn a small fee each time. Takes a minute to set up."
          action={<Button title="Set up" icon="arrow-right" onPress={() => nav.navigate("AgentSetup")} />}
        />
      </Screen>
    );
  }

  const toggle = async (v: boolean) => {
    setBusy(true);
    try {
      await setAgentOnline(v);
      success();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen large title="Agent desk" right={<IconButton name="share-2" label="Share your desk" onPress={() => setShare(true)} />}>
      <View style={{ backgroundColor: c.hero, borderRadius: radius.xl, padding: space.xl, gap: space.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          {online ? (
            <Pulse color={c.positive} />
          ) : (
            <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.heroMuted }} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text variant="heading" color={c.heroText}>
              {online ? "You're open" : "You're closed"}
            </Text>
            <Text variant="caption" color={c.heroMuted}>
              {online
                ? publishError
                  ? `Customers can't see you: ${publishError}`
                  : lastPublishedAt
                    ? "Customers can find you"
                    : "Letting customers know…"
                : "Customers can't find you"}
            </Text>
          </View>
        </View>
        <Button title={online ? "Close for now" : "Open for customers"} kind={online ? "secondary" : "primary"} loading={busy} onPress={() => toggle(!online)} />
        <View style={{ flexDirection: "row", gap: space.md }}>
          <Stat label="Earned today" value={fee(earned.currency, earned.today)} />
          <Stat label="This week" value={fee(earned.currency, earned.week)} />
          <Stat label="Your float" value={balance === null ? "…" : money.primary(balance)} />
        </View>
      </View>

      {online && <Text variant="caption" faint center>{`Keep ${BRAND.name} open to get requests.`}</Text>}

      <Section title={`Requests${requests.length ? ` · ${requests.length}` : ""}`}>
        {requests.length === 0 ? (
          <Card tone="alt">
            <Text variant="caption" muted>
              {online ? (autoAccept ? "Requests that fit your offer start right away." : "Requests show up here.") : "Open up to get requests."}
            </Text>
          </Card>
        ) : (
          <Card style={{ paddingVertical: space.sm, gap: 0 }}>
            {requests.map((i) => (
              <SwapRow key={i.rec.id} item={i} />
            ))}
          </Card>
        )}
      </Section>

      {running.length > 0 && (
        <Section title="In progress">
          <Card style={{ paddingVertical: space.sm, gap: 0 }}>
            {running.map((i) => (
              <SwapRow key={i.rec.id} item={i} />
            ))}
          </Card>
        </Section>
      )}

      <Section title="Your offer" action={<Button small kind="ghost" title="Edit" onPress={() => nav.navigate("AgentSetup")} />}>
        {markets.map((m) => (
          <OfferPreview key={m.currency} market={m} />
        ))}
      </Section>

      <Card style={{ paddingVertical: space.sm, gap: 0 }}>
        <Row
          icon="list"
          title="All swaps"
          subtitle={completed.length ? `${completed.length} done${earned.total > 0 ? ` · ${fee(earned.currency, earned.total)} earned` : ""}` : undefined}
          chevron
          onPress={() => nav.navigate("Swaps")}
        />
      </Card>
      {keys && <AgentShareSheet pk={keys.identity.pk} name={name} visible={share} onClose={() => setShare(false)} />}
    </Screen>
  );
}

/** Fees on small swaps are fractions of a shilling, so show cents. */
function fee(currency: string, amount: number) {
  return `${currency} ${amount.toFixed(2)}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="caption" color={c.heroMuted}>
        {label}
      </Text>
      <Text variant="label" color={c.heroText} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

/** What customers see from you, in their words: add money, cash out, your fee. */
function OfferPreview({ market }: { market: Market }) {
  const keys = useSession((s) => s.keys);
  const rate = useWallet((s) => s.rates[market.currency]);
  const balance = useWallet((s) => s.balance);
  const built: MarketOffers = keys && rate ? buildOffers(keys, market, rate, balance ?? 0, 0) : {};
  const ready = Object.keys(market.channels).filter((c) => detailsComplete(c, market.channels[c]));
  const range = (o?: { min: string; max: string }) => (o ? ` · ${market.currency} ${formatDecimal(o.min)}–${formatDecimal(o.max)}` : "");
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text variant="heading">
          {currencyInfo(market.currency).flag} {market.currency}
        </Text>
        {!ready.length && <Badge label="Add how customers pay you" tone="warning" />}
      </View>
      {market.buy.enabled && (
        <Row icon="plus-circle" title="Add money" subtitle={`${market.buy.spreadPct}% fee${range(built.buy)}`} />
      )}
      {market.buy.enabled && rate && !built.buy && ready.length > 0 && <Notice tone="warning">Top up your float so customers can add money.</Notice>}
      {market.sell.enabled && (
        <Row icon="minus-circle" title="Cash out" subtitle={`${market.sell.spreadPct}% fee${range(built.sell)}`} />
      )}
      <Text variant="caption" muted>
        {ready.length ? `Paid by ${ready.map((c) => channelInfo(c).short).join(", ")}` : "No payment method yet"}
      </Text>
    </Card>
  );
}

// -- setup -------------------------------------------------------------------------

const FEES = [1, 2, 3, 5];
/** Payment channels shown before "More": the registry lists the common ones first. */
const COMMON_CHANNELS = 3;

/**
 * Becoming an agent, in four short answers: how customers pay you, what you
 * help with, your fee, and your name. Finishing opens the desk. Everything
 * else (a "where and when" note, more currencies, auto-accept) waits under "More".
 */
export function AgentSetupScreen() {
  const nav = useNavigation<any>();
  const c = useColors();
  const profile = useSession((s) => s.profile);
  const setProfile = useSession((s) => s.setProfile);
  const setMode = useSession((s) => s.setMode);
  const { markets, saveMarkets, autoAccept, setAutoAccept, online, configured } = useAgent();
  const [name, setName] = useState(profile.name);
  const [about, setAbout] = useState(profile.about);
  const [draft, setDraft] = useState<Market[]>(markets.length ? markets : [defaultMarket(useSession.getState().currency)]);
  const [picking, setPicking] = useState<"primary" | "extra" | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [channelEdit, setChannelEdit] = useState<string | null>(null);
  const [allChannels, setAllChannels] = useState(false);
  const [busy, setBusy] = useState(false);

  const primary = draft[0];
  const setPrimary = (m: Market) => setDraft([m, ...draft.slice(1)]);
  const feePct = primary.buy.enabled ? primary.buy.spreadPct : primary.sell.spreadPct;
  const setFee = (p: number) => setPrimary({ ...primary, buy: { ...primary.buy, spreadPct: p }, sell: { ...primary.sell, spreadPct: p } });
  const limits = primary.buy.enabled ? primary.buy : primary.sell;
  const setLimits = (l: { min?: string; max?: string }) => setPrimary({ ...primary, buy: { ...primary.buy, ...l }, sell: { ...primary.sell, ...l } });
  const example = 1000;
  const limitsOk = isDecimalAmount(limits.min) && isDecimalAmount(limits.max) && Number(limits.min) <= Number(limits.max);
  const hasChannel = draft.some((m) => Object.keys(m.channels).some((ch) => detailsComplete(ch, m.channels[ch])));
  // Say what's missing rather than leave a grey button to guess at.
  const missing = !hasChannel
    ? "Pick how customers pay you."
    : !(primary.buy.enabled || primary.sell.enabled)
      ? "Turn on Add money or Cash out."
      : name.trim().length < 2
        ? "Add your name."
        : !limitsOk
          ? "Check your limits."
          : null;

  // First time, finishing opens the desk: setting up is saying you're ready.
  const save = async () => {
    setBusy(true);
    setProfile({ name: name.trim(), about: about.trim() });
    saveMarkets(draft);
    setMode("agent");
    const open = online || !configured;
    try {
      if (open) await setAgentOnline(true);
      success();
      toast(configured ? "Offer updated" : "You're open", "success");
    } catch (e) {
      toast(`Saved, but couldn't open: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
      nav.goBack();
    }
  };
  const channels = channelsForCurrency(primary.currency);
  const shownChannels = channels.filter((ch, i) => allChannels || i < COMMON_CHANNELS || ch.id in primary.channels);

  const extra = draft.find((m) => m.currency === editing);

  return (
    <Screen
      back
      title={configured ? "Your offer" : "Become an agent"}
      footer={
        <View style={{ gap: space.sm }}>
          {missing && (
            <Text variant="caption" muted center>
              {missing}
            </Text>
          )}
          <Button title={configured ? "Save" : "Open for customers"} loading={busy} disabled={!!missing} onPress={save} />
        </View>
      }
    >
      <Section title="1 · Customers pay you by">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <Chip emoji={currencyInfo(primary.currency).flag} label={primary.currency} icon="chevron-down" onPress={() => setPicking("primary")} />
          {shownChannels.map((ch) => {
            const on = ch.id in primary.channels;
            const done = detailsComplete(ch.id, primary.channels[ch.id]);
            return <Chip key={ch.id} label={ch.short} icon={on ? (done ? "check" : "alert-circle") : "plus"} selected={on} onPress={() => setChannelEdit(ch.id)} />;
          })}
          {shownChannels.length < channels.length && <Chip label="More" icon="chevron-down" onPress={() => setAllChannels(true)} />}
        </View>
        {channelEdit && (
          <ChannelForm
            channel={channelEdit}
            initial={primary.channels[channelEdit]}
            onCancel={() => setChannelEdit(null)}
            onDone={(d) => {
              const channels = { ...primary.channels };
              if (d) channels[channelEdit] = d;
              else delete channels[channelEdit];
              setPrimary({ ...primary, channels });
              setChannelEdit(null);
            }}
          />
        )}
      </Section>

      <Section title="2 · You help them">
        <Card style={{ paddingVertical: space.sm, gap: 0 }}>
          <Toggle
            icon="plus-circle"
            label="Add money"
            value={primary.buy.enabled}
            onChange={(enabled) => setPrimary({ ...primary, buy: { ...primary.buy, enabled } })}
          />
          <Toggle
            icon="minus-circle"
            label="Cash out"
            value={primary.sell.enabled}
            onChange={(enabled) => setPrimary({ ...primary, sell: { ...primary.sell, enabled } })}
          />
        </Card>
      </Section>

      <Section title="3 · Your fee">
        <View style={{ flexDirection: "row", gap: space.sm }}>
          {FEES.map((p) => (
            <Chip key={p} label={`${p}%`} selected={feePct === p} onPress={() => setFee(p)} />
          ))}
        </View>
        <Text variant="caption" muted>
          {`${primary.currency} ${((example * feePct) / 100).toFixed(0)} on every ${primary.currency} ${example.toLocaleString()}`}
        </Text>
        <Collapsible title="Limits" summary={`${primary.currency} ${formatDecimal(limits.min)} – ${formatDecimal(limits.max)}`}>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Field label="Smallest" keyboardType="decimal-pad" value={limits.min} onChangeText={(min) => setLimits({ min: min.replace(/,/g, "") })} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Largest" keyboardType="decimal-pad" value={limits.max} onChangeText={(max) => setLimits({ max: max.replace(/,/g, "") })} />
            </View>
          </View>
        </Collapsible>
      </Section>

      <Section title="4 · Your name">
        <Field value={name} onChangeText={setName} placeholder="e.g. Wanjiku's shop" maxLength={48} />
      </Section>

      <Collapsible title="More">
        <Field label="Where and when" value={about} onChangeText={setAbout} placeholder="e.g. Kenyatta Ave, 7am–10pm" maxLength={160} multiline />
        <Card style={{ paddingVertical: space.sm, gap: 0 }}>
          <Toggle icon="zap" label="Accept requests automatically" value={autoAccept} onChange={setAutoAccept} />
        </Card>
        <Section title="Other currencies" action={<Button small kind="ghost" icon="plus" title="Add" onPress={() => setPicking("extra")} />}>
          {draft.length > 1 &&
            draft.slice(1).map((m) => (
              <Card key={m.currency} onPress={() => setEditing(m.currency)} style={{ flexDirection: "row", alignItems: "center" }}>
                <Text variant="title">{currencyInfo(m.currency).flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text variant="label">{m.currency}</Text>
                  <Text variant="caption" muted>
                    {[m.buy.enabled && `Add money ${m.buy.spreadPct}%`, m.sell.enabled && `Cash out ${m.sell.spreadPct}%`].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={c.textFaint} />
              </Card>
            ))}
        </Section>
      </Collapsible>

      <Sheet visible={picking !== null} onClose={() => setPicking(null)} title={picking === "primary" ? "Customers pay you in" : "Add a currency"}>
        <ScrollView style={{ maxHeight: 420 }}>
          {CURRENCIES.filter((cur) => (picking === "primary" ? cur.code !== primary.currency : !draft.some((m) => m.currency === cur.code))).map((cur) => (
            <Row
              key={cur.code}
              left={<Text variant="title">{cur.flag}</Text>}
              title={`${cur.code} · ${cur.name}`}
              onPress={() => {
                if (picking === "primary") {
                  // Keep the fee and what they help with; channels belong to the currency.
                  const existing = draft.find((m) => m.currency === cur.code);
                  const next = existing ?? { ...defaultMarket(cur.code), buy: { ...defaultMarket(cur.code).buy, enabled: primary.buy.enabled, spreadPct: primary.buy.spreadPct }, sell: { ...defaultMarket(cur.code).sell, enabled: primary.sell.enabled, spreadPct: primary.sell.spreadPct } };
                  setDraft([next, ...draft.filter((m) => m.currency !== cur.code && m.currency !== primary.currency)]);
                  setChannelEdit(null);
                } else {
                  setDraft([...draft, defaultMarket(cur.code)]);
                  setEditing(cur.code);
                }
                setPicking(null);
              }}
            />
          ))}
        </ScrollView>
      </Sheet>
      {extra && (
        <MarketSheet
          market={extra}
          onClose={() => setEditing(null)}
          onSave={(m) => {
            setDraft(draft.map((x) => (x.currency === m.currency ? m : x)));
            setEditing(null);
          }}
          onRemove={() => {
            setDraft(draft.filter((x) => x.currency !== extra.currency));
            setEditing(null);
          }}
        />
      )}
    </Screen>
  );
}

function MarketSheet({ market, onClose, onSave, onRemove }: { market: Market; onClose: () => void; onSave: (m: Market) => void; onRemove?: () => void }) {
  const [m, setM] = useState<Market>(market);
  const [channelEdit, setChannelEdit] = useState<string | null>(null);
  const options = channelsForCurrency(m.currency);
  const valid = (s: MarketSide) => !s.enabled || (isDecimalAmount(s.min) && isDecimalAmount(s.max) && Number(s.min) <= Number(s.max) && s.spreadPct >= -5 && s.spreadPct <= 30);
  // Back and tap-outside close the sheet; don't let them silently drop edits.
  const close = () => {
    if (!channelEdit && JSON.stringify(m) === JSON.stringify(market)) return onClose();
    void confirm({
      title: "Discard changes?",
      message: `Your changes to ${m.currency} haven't been saved.`,
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      tone: "danger",
    }).then((ok) => ok && onClose());
  };

  return (
    <Sheet visible onClose={close} title={`${currencyInfo(m.currency).flag} ${m.currency}`}>
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: space.lg }} keyboardShouldPersistTaps="handled">
        <Section title="How customers pay you">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {options.map((ch) => {
              const on = ch.id in m.channels;
              const done = detailsComplete(ch.id, m.channels[ch.id]);
              return <Chip key={ch.id} label={ch.short} icon={on ? (done ? "check" : "alert-circle") : "plus"} selected={on} onPress={() => setChannelEdit(ch.id)} />;
            })}
          </View>
          {channelEdit && (
            <ChannelForm
              channel={channelEdit}
              initial={m.channels[channelEdit]}
              onCancel={() => setChannelEdit(null)}
              onDone={(d) => {
                const channels = { ...m.channels };
                if (d) channels[channelEdit] = d;
                else delete channels[channelEdit];
                setM({ ...m, channels });
                setChannelEdit(null);
              }}
            />
          )}
        </Section>
        <SideEditor
          title="Add money"
          hint="Customers pay you, and you send them money from your balance."
          side={m.buy}
          currency={m.currency}
          onChange={(buy) => setM({ ...m, buy })}
        />
        <SideEditor
          title="Cash out"
          hint="Customers send you money, and you pay them."
          side={m.sell}
          currency={m.currency}
          onChange={(sell) => setM({ ...m, sell })}
        />
        {onRemove && <Button kind="danger" small title={`Remove ${m.currency}`} onPress={onRemove} />}
      </ScrollView>
      <Button title="Done" disabled={!valid(m.buy) || !valid(m.sell)} onPress={() => onSave(m)} />
    </Sheet>
  );
}

function SideEditor({ title, hint, side, currency, onChange }: { title: string; hint: string; side: MarketSide; currency: string; onChange: (s: MarketSide) => void }) {
  return (
    <Card tone="alt">
      <Toggle label={title} subtitle={hint} value={side.enabled} onChange={(enabled) => onChange({ ...side, enabled })} />
      {side.enabled && (
        <>
          <Text variant="label">Your fee</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {[0.5, 1, 2, 3, 5].map((p) => (
              <Chip key={p} label={`${p}%`} selected={side.spreadPct === p} onPress={() => onChange({ ...side, spreadPct: p })} />
            ))}
          </View>
          <Text variant="caption" muted>
            {`On ${currency} 1,000 you earn about ${currency} ${((1000 * side.spreadPct) / 100).toFixed(0)}.`}
          </Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Field label={`Smallest ${currency}`} keyboardType="decimal-pad" value={side.min} onChangeText={(min) => onChange({ ...side, min: min.replace(/,/g, "") })} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={`Largest ${currency}`} keyboardType="decimal-pad" value={side.max} onChangeText={(max) => onChange({ ...side, max: max.replace(/,/g, "") })} />
            </View>
          </View>
        </>
      )}
    </Card>
  );
}

function ChannelForm({ channel, initial, onDone, onCancel }: { channel: string; initial?: ChannelDetails; onDone: (d: ChannelDetails | null) => void; onCancel: () => void }) {
  const info = channelInfo(channel);
  const [d, setD] = useState<ChannelDetails>(initial ?? {});
  const check = validateDetails(channel, d);
  return (
    <Card>
      <Text variant="heading">{info.label}</Text>
      {info.fields.length > 0 && (
        <Text variant="caption" muted>
          Only shared with customers you accept.
        </Text>
      )}
      <ChannelFields channel={channel} value={d} onChange={setD} />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button style={{ flex: 1 }} small kind="secondary" title="Cancel" onPress={onCancel} />
        {initial && <Button style={{ flex: 1 }} small kind="danger" title="Remove" onPress={() => onDone(null)} />}
        <Button style={{ flex: 1 }} small title={info.fields.length ? "Save channel" : "Offer cash"} disabled={!check.valid} onPress={() => onDone(check.data)} />
      </View>
    </Card>
  );
}

export function useConfirmLeaveAgent() {
  const setMode = useSession((s) => s.setMode);
  return () => {
    if (!useAgent.getState().online) return setMode("user");
    void confirm({
      title: "Close your desk?",
      message: "Customers can't find you while you use your wallet for yourself. Open up again any time.",
      confirmLabel: "Close and switch",
      cancelLabel: "Stay open",
      icon: "user",
    }).then(async (ok) => {
      if (!ok) return;
      await setAgentOnline(false).catch(() => undefined);
      setMode("user");
    });
  };
}
