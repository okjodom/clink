import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, usePreventRemove, useRoute } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Keyboard, Platform, ScrollView, View } from "react-native";

import { useMoney } from "../hooks";
import { errorText } from "../lib/errors";
import { parseAgentLink } from "../lib/links";
import { lowestFeeOption, oncePayment, quoteProblem, shortRecipient } from "../lib/sendFlow";
import { formatSats } from "../lib/money";
import { formatUsd, looksLikeStablecoinAddress, tokenAmount } from "../lib/stablecoins";
import { expandUsername } from "../lib/username";
import * as wallet from "../services/wallet";
import { useWallet } from "../store/wallet";
import { useContacts } from "../store/contacts";
import { contactAddress } from "../services/contacts";
import { ContactRow } from "../ui/contactRow";
import { hasContactUsername, type Contact } from "../lib/contacts";
import { AmountDisplay, AmountPad, useAmountInput } from "../ui/amount";
import { Avatar, Button, Card, Field, IconButton, Logo, Notice, Row, Screen, Section, Text, success } from "../ui/components";
import { NumPad, QrShareSheet, Sheet, toastError } from "../ui/extras";
import { PaymentReceiptSheet, type Receipt } from "../ui/paymentReceipt";
import { KeyValue } from "../ui/rows";
import { radius, space, useColors } from "../ui/theme";

type SentPayment = { tx: wallet.WalletTx; receipt: Receipt };
const payable = (value: string) => /^(lightning:|bitcoin:|lnbc|lntb|lnurl|bc1|tb1|sp1|spark1)|^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value) || looksLikeStablecoinAddress(value);

/** Pick someone, compose an amount, then explicitly confirm the prepared payment. */
export function SendScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const c = useColors();
  const money = useMoney();
  const input = useAmountInput();
  const balance = useWallet((s) => s.balance);
  const ownAddress = useWallet((s) => s.lightningAddress);
  const contacts = useContacts((s) => s.entries);
  const [contactId, setContactId] = useState<string | undefined>(route.params?.contactId);
  const [text, setText] = useState<string>(route.params?.input ?? "");
  const [parsed, setParsed] = useState<wallet.ParsedInput | null>(null);
  const [prepared, setPrepared] = useState<wallet.PreparedSend | null>(null);
  const [stableQuote, setStableQuote] = useState<wallet.PreparedStablecoinSend | null>(null);
  const [routes, setRoutes] = useState<wallet.StableRoute[]>([]);
  const [stableRoute, setStableRoute] = useState<wallet.StableRoute | null>(null);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [usd, setUsd] = useState("0");
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const operation = useRef<"parse" | "review" | "send" | null>(null);
  const generation = useRef(0);
  const [sent, setSent] = useState<SentPayment | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [payBackOpen, setPayBackOpen] = useState(false);
  const latestPayments = useRef(new Map<string, wallet.WalletTx>());

  useEffect(() => wallet.onWalletEvent((event) => {
    if (event.type !== "payment") return;
    latestPayments.current.set(event.payment.id, event.payment);
    setSent((previous) => previous?.tx.id === event.payment.id ? { ...previous, tx: event.payment } : previous);
  }), []);
  useEffect(() => () => { generation.current++; }, []);

  useEffect(() => {
    if (Platform.OS !== "android" || route.params?.input) return;
    void Clipboard.getStringAsync().then((value) => {
      const candidate = value.trim();
      if (candidate && candidate.length < 2000 && payable(candidate) && candidate !== ownAddress) setCopied(candidate);
    }).catch(() => undefined);
    // Read once on entry; never interrupt typing with clipboard updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearReview = () => {
    if (operation.current === "send") return;
    setPrepared(null);
    setStableQuote(null);
    setError(null);
  };
  const changeRecipient = () => {
    if (operation.current) return;
    clearReview();
    setParsed(null);
    setNetworkOpen(false);
    setContactId(undefined);
  };
  const back = () => {
    if (operation.current === "send") return;
    if (operation.current) {
      generation.current++;
      operation.current = null;
      setBusy(false);
    }
    if (parsed && !sent) changeRecipient();
    else nav.goBack();
  };
  useFocusEffect(useCallback(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (Keyboard.isVisible()) { Keyboard.dismiss(); return true; }
      if (operation.current === "send") return true;
      if (parsed && !sent) { back(); return true; }
      return false;
    });
    return () => listener.remove();
    // Modal sheets handle their own back actions before this listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, sent]));
  usePreventRemove(!!parsed && !sent, () => back());

  const parse = async (value: string, selectedContactId?: string) => {
    if (operation.current || !value.trim()) return;
    Keyboard.dismiss();
    const candidate = value.trim();
    setText(candidate);
    setContactId(selectedContactId);
    setError(null);
    const agent = parseAgentLink(candidate);
    if (agent) { nav.replace("AgentProfile", { pk: agent }); return; }
    const version = ++generation.current;
    operation.current = "parse";
    setBusy(true);
    setPrepared(null);
    setStableQuote(null);
    setRoutes([]);
    setStableRoute(null);
    try {
      const next = await wallet.parseInput(expandUsername(candidate, ownAddress));
      if (version !== generation.current) return;
      if (next.type === "stablecoin") {
        const options = await wallet.stablecoinSendRoutes(next);
        if (version !== generation.current) return;
        if (!options.length) throw new Error("This address can't receive USDT or USDC right now.");
        setRoutes(options);
        // Ambiguous addresses require an explicit network choice.
        setStableRoute(options.length === 1 ? options[0] : null);
        if (next.details.amount !== undefined && options.length === 1) setUsd(tokenAmount(BigInt(next.details.amount), options[0].decimals));
      }
      if (next.type !== "lnurl" && next.type !== "stablecoin" && next.amountSats) input.setSats(Number(next.amountSats));
      if (next.type === "bolt11" && !next.amountSats) throw new Error("Ask for a payment request with an amount.");
      setParsed(next);
    } catch (cause) {
      if (version !== generation.current) return;
      setParsed(null);
      const message = errorText(cause);
      setError(/SdkError.InvalidInput|Unrecognized|parse/i.test(message) ? "Couldn't find that recipient. Check the username or code." : message);
    } finally {
      if (version === generation.current) { operation.current = null; setBusy(false); }
    }
  };
  useEffect(() => {
    if (route.params?.input) void parse(route.params.input, route.params.contactId);
    // A scan returns to this composer, preserving the amount already entered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.input, route.params?.scanId, route.params?.contactId]);

  const stable = parsed?.type === "stablecoin";
  const fixedAmount = parsed && parsed.type !== "lnurl" && parsed.type !== "stablecoin" ? parsed.amountSats : undefined;
  const sats = fixedAmount ? Number(fixedAmount) : input.sats;
  const recipient = parsed?.type === "lnurl" ? parsed.address ?? "Payment request"
    : parsed?.type === "bolt11" ? "Payment request" : parsed?.address ?? text;
  const tooMuch = !stable && balance !== null && sats > balance;
  const outsideLnurl = parsed?.type === "lnurl" && sats > 0 && (BigInt(sats) < parsed.minSats || BigInt(sats) > parsed.maxSats);
  const outsideStable = stableRoute && Number(usd) > 0 && ((stableRoute.minUsd !== undefined && Number(usd) < stableRoute.minUsd) || (stableRoute.maxUsd !== undefined && Number(usd) > stableRoute.maxUsd));
  const amountProblem = tooMuch ? "More than your available balance"
    : outsideLnurl && parsed?.type === "lnurl" ? `Between ${money.primary(parsed.minSats)} and ${money.primary(parsed.maxSats)}`
    : outsideStable && stableRoute ? (Number(usd) < (stableRoute.minUsd ?? 0) ? `At least ${formatUsd(stableRoute.minUsd!)}` : `At most ${formatUsd(stableRoute.maxUsd!)}`) : null;
  const totalProblem = prepared ? quoteProblem(prepared.amountSats, prepared.feeSats, balance === null ? null : BigInt(balance)) : null;

  const review = async () => {
    if (!parsed || operation.current || amountProblem) return;
    const version = ++generation.current;
    operation.current = "review";
    setBusy(true);
    setError(null);
    try {
      if (parsed.type === "stablecoin") {
        if (!stableRoute || Number(usd) <= 0) return;
        const quote = await wallet.prepareStablecoinSend(parsed, stableRoute, usd);
        if (version === generation.current) setStableQuote({ ...quote, send: oncePayment(quote.send) });
      } else {
        if (!(sats > 0)) return;
        const quote = await wallet.prepareSend(parsed, fixedAmount ? undefined : BigInt(sats));
        if (version === generation.current) setPrepared({ ...quote, send: oncePayment(quote.send) });
      }
    } catch (cause) { if (version === generation.current) setError(errorText(cause)); }
    finally { if (version === generation.current) { operation.current = null; setBusy(false); } }
  };

  const confirm = async () => {
    if (operation.current || !parsed || (!prepared && !stableQuote) || totalProblem) return;
    if (stableQuote?.expiresAt && Date.now() / 1000 >= stableQuote.expiresAt) {
      setStableQuote(null);
      setError("That quote expired. Review the payment again.");
      return;
    }
    operation.current = "send";
    setBusy(true);
    setError(null);
    try {
      const tx = await (stableQuote ? stableQuote.send() : prepared!.send());
      const current = tx.status === "complete" ? tx : latestPayments.current.get(tx.id) ?? tx;
      const amount = stableQuote ? `≈ ${formatUsd(stableQuote.theyGetUsd)} ${stableRoute?.asset ?? ""}` : money.primary(prepared!.amountSats);
      setSent({ tx: current, receipt: { recipient, amount, timestamp: tx.timestamp, network: stableQuote ? stableRoute?.label : undefined } });
      setPrepared(null);
      setStableQuote(null);
      if (current.status !== "failed") {
        const address = parsed.type === "lnurl" ? parsed.address : parsed.type === "bolt11" ? undefined : parsed.address;
        const known = contactId ? contacts[contactId] : undefined;
        if (address && address !== ownAddress) useContacts.getState().record({ pubkey: known?.pubkey, address, name: known?.name, role: "user", at: current.timestamp });
      }
      if (current.status === "complete") success();
      void useWallet.getState().refresh();
    } catch (cause) {
      setError(`${errorText(cause)} Check Activity before trying again.`);
      setPrepared(null);
      setStableQuote(null);
    } finally { operation.current = null; setBusy(false); }
  };

  if (sent) {
    const complete = sent.tx.status === "complete";
    const failed = sent.tx.status === "failed";
    return (
      <Screen back title="Send" footer={<Button title="Done" onPress={() => nav.goBack()} />}>
        <View style={{ alignItems: "center", gap: space.md, paddingVertical: space.xxl }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: failed ? c.dangerSoft : complete ? c.positiveSoft : c.infoSoft }}>
            <Feather name={failed ? "alert-circle" : complete ? "check" : "clock"} size={36} color={failed ? c.danger : complete ? c.positive : c.info} />
          </View>
          <Text variant="title">{failed ? "Payment didn't complete" : complete ? "Money sent" : "On its way"}</Text>
          <Text variant="display" adjustsFontSizeToFit numberOfLines={1}>{sent.receipt.amount}</Text>
          <Text muted>{`To ${shortRecipient(sent.receipt.recipient)}`}</Text>
          {!complete && <Text variant="caption" muted center>{failed ? "Check Activity for the payment details." : "We'll update this when the payment completes."}</Text>}
        </View>
        {complete && <Button kind="secondary" title="Share receipt" icon="share-2" onPress={() => setReceiptOpen(true)} />}
        {complete && ownAddress && <Card tone="positive">
          <Text variant="heading">Someone paying you back?</Text>
          <Text variant="caption" muted>Share your username QR. They scan it and send to you.</Text>
          <Button kind="secondary" title="Pay me back" icon="grid" onPress={() => setPayBackOpen(true)} />
        </Card>}
        {complete && <PaymentReceiptSheet receipt={sent.receipt} visible={receiptOpen} onClose={() => setReceiptOpen(false)} />}
        {ownAddress && <QrShareSheet visible={payBackOpen} onClose={() => setPayBackOpen(false)} title="Pay me back" caption={ownAddress} value={ownAddress} fileName="pay-me-back" share />}
      </Screen>
    );
  }

  const scan = () => nav.navigate("Scan", { returnToSend: true });
  const paste = async () => {
    if (operation.current) return;
    try { await parse(await Clipboard.getStringAsync()); }
    catch (cause) { toastError(cause); }
  };
  const pickContact = async (contact: Contact) => {
    if (operation.current) return;
    const version = ++generation.current;
    operation.current = "parse";
    setBusy(true);
    setError(null);
    try {
      const address = await contactAddress(contact);
      if (version !== generation.current) return;
      operation.current = null;
      await parse(address, contact.id);
    } catch (cause) { if (version === generation.current) setError(errorText(cause)); }
    finally { if (version === generation.current) { operation.current = null; setBusy(false); } }
  };
  const people = Object.values(contacts).filter(hasContactUsername)
    .filter((contact) => !text.trim() || [contact.name, contact.address].some((value) => value?.toLowerCase().includes(text.trim().toLowerCase().replace(/^@/, ""))))
    .sort((a, b) => b.lastAt - a.lastAt).slice(0, 8);
  if (!parsed) return (
    <Screen back onBack={back} title="Send" right={<IconButton name="maximize" label="Scan payment code" onPress={scan} />}
      footer={<Button title="Continue" loading={busy} disabled={!text.trim()} onPress={() => parse(text)} />}>
      <View style={{ gap: space.sm, paddingTop: space.lg }}>
        <Text variant="title">Who are you paying?</Text>
        <Text muted>A username is all you need.</Text>
      </View>
      <Field value={text} onChangeText={(value) => { setText(value); setError(null); }} editable={!busy}
        placeholder="Username or address" accessibilityLabel="Recipient username or address" autoCapitalize="none" autoCorrect={false}
        returnKeyType="next" onSubmitEditing={() => void parse(text)} error={error} />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button small style={{ flex: 1 }} kind="secondary" title="Paste" icon="clipboard" disabled={busy} onPress={paste} />
        <Button small style={{ flex: 1 }} kind="secondary" title="Scan" icon="maximize" disabled={busy} onPress={scan} />
      </View>
      {copied && copied !== text && <Card tone="primary" onPress={busy ? undefined : () => void parse(copied)}>
        <Row icon="clipboard" title="Use what you copied" subtitle={shortRecipient(copied)} chevron />
      </Card>}
      {people.length > 0 && <Section title="Your people" action={<Button small kind="ghost" title="See all" onPress={() => nav.navigate("Contacts")} />}><Card style={{ paddingVertical: space.sm, gap: 0 }}>
        {people.map((contact) => <ContactRow key={contact.id} contact={contact} onPress={busy ? undefined : () => void pickContact(contact)} />)}
      </Card></Section>}
    </Screen>
  );

  return (
    <Screen back onBack={back} title="Send" scroll={false} right={<IconButton name="maximize" label="Scan a different recipient" onPress={() => !busy && scan()} />}
      footer={<Button title="Review payment" loading={busy} disabled={!!amountProblem || (stable ? !stableRoute || Number(usd) <= 0 : sats <= 0)} onPress={review} />}>
      <Card style={{ paddingVertical: space.sm }}>
        <Row left={<Avatar pk={recipient} name={recipient} size={36} />} title={shortRecipient(recipient)} subtitle="Recipient"
          right={<Button small kind="ghost" title="Change" disabled={busy} onPress={changeRecipient} />} />
      </Card>
      {stable && <Row icon="globe" title={stableRoute?.label ?? "Choose asset and network"} subtitle="Must match the recipient's wallet" chevron onPress={busy ? undefined : () => setNetworkOpen(true)} />}
      <View style={{ flex: 1, justifyContent: "center" }}>
        {stable ? <View style={{ alignItems: "center", gap: space.sm }}>
          <Text variant="caption" muted>USD</Text><Text variant="hero" adjustsFontSizeToFit numberOfLines={1}>{usd}</Text>
          <Text variant="caption" muted>{stableRoute ? `Send as ${stableRoute.asset}` : "Choose a network above"}</Text>
        </View> : fixedAmount ? <View style={{ alignItems: "center", gap: space.sm }}>
          <Text variant="hero" adjustsFontSizeToFit numberOfLines={1}>{money.primary(fixedAmount)}</Text>
          <Text muted>{money.secondary(fixedAmount)}</Text>
          {parsed.type === "bolt11" && parsed.description && <Text variant="caption" muted center>{parsed.description}</Text>}
        </View> : <AmountDisplay input={input} />}
        <Text variant="caption" muted center>{balance === null ? "Loading your available balance…" : `Available: ${money.primary(balance)}`}</Text>
        {(amountProblem || error) && <Text variant="caption" color={c.danger} center style={{ marginTop: space.sm }}>{amountProblem ?? error}</Text>}
      </View>
      {!fixedAmount && (stable ? <NumPad value={usd} onChange={setUsd} decimals={Math.min(stableRoute?.decimals ?? 6, 8)} max={12} /> : <AmountPad input={input} />)}
      <Sheet visible={networkOpen} onClose={() => setNetworkOpen(false)} title="Asset and network">
        <Text variant="caption" muted>Choose the network the recipient uses for this address.</Text>
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: space.sm }}>
          {routes.map((option) => <Row key={option.label} icon={option.label === stableRoute?.label ? "check-circle" : "circle"} title={option.label} onPress={() => { setStableRoute(option); if (parsed.type === "stablecoin" && parsed.details.amount !== undefined) setUsd(tokenAmount(BigInt(parsed.details.amount), option.decimals)); setNetworkOpen(false); setError(null); }} />)}
        </ScrollView>
      </Sheet>
      <Sheet visible={!!prepared || !!stableQuote} onClose={clearReview} title="Review payment" right={<Logo size={36} />}>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: space.lg }}>
          <View style={{ alignItems: "center", paddingVertical: space.md, gap: space.xs }}>
            <Text variant="display" adjustsFontSizeToFit numberOfLines={1}>{stableQuote ? `≈ ${formatUsd(stableQuote.theyGetUsd)}` : prepared ? money.primary(prepared.amountSats) : ""}</Text>
            <Text muted>{stableQuote ? stableRoute?.label : "To your recipient"}</Text>
          </View>
          <View style={{ padding: space.lg, borderRadius: radius.lg, backgroundColor: c.surface, gap: space.md }}>
            <KeyValue label="To" value={recipient} />
            {stableQuote && <>
              <KeyValue label="Recipient gets" value={`${stableQuote.theyGetAmount} ${stableRoute?.asset ?? ""}`} />
              <KeyValue label="Network" value={stableRoute?.label ?? ""} />
              <KeyValue label="Estimated fee" value={formatUsd(stableQuote.feeUsd)} />
              <KeyValue label="Total" value={formatUsd(stableQuote.totalUsd)} />
              <KeyValue label="Paid from" value={stableQuote.from === "dollars" ? "Your dollars" : "Your bitcoin"} />
            </>}
            {prepared && <>
              <KeyValue label="Fee" value={prepared.feeSats === 0n ? "Free" : `${money.primary(prepared.feeSats)} · ${formatSats(prepared.feeSats)}`} />
              <KeyValue label="Total" value={money.primary(prepared.amountSats + prepared.feeSats)} />
            </>}
          </View>
          {prepared?.onchain && <View style={{ gap: space.sm }}>
            <Text variant="label">Speed</Text>
            {prepared.onchain.options.map((option) => <Row key={option.speed}
              icon={option.speed === prepared.onchain!.speed ? "check-circle" : "circle"}
              title={{ slow: "Economy", medium: "Standard", fast: "Fast" }[option.speed]}
              subtitle={`${money.primary(option.feeSats)} · ${formatSats(option.feeSats)}${option.speed === lowestFeeOption(prepared.onchain!.options).speed ? " · Lowest fee" : ""}`}
              onPress={busy ? undefined : () => {
                const next = prepared.onchain!.selectSpeed(option.speed);
                setPrepared({ ...next, send: oncePayment(next.send) });
                setError(null);
              }} />)}
            <Text variant="caption" muted>Economy may take longer to confirm. Fees include provider and Bitcoin network charges.</Text>
          </View>}
          {stableQuote && <Notice tone="warning">{`Confirm the recipient uses ${stableRoute?.label}. This network must match.`}</Notice>}
          {(totalProblem || error) && <Notice tone="danger">{totalProblem ?? error}</Notice>}
        </ScrollView>
        <Button title={stableQuote ? `Send ${formatUsd(stableQuote.totalUsd)}` : prepared ? `Send ${money.primary(prepared.amountSats)}` : "Send"} loading={busy} disabled={!!totalProblem} onPress={confirm} />
      </Sheet>
    </Screen>
  );
}
