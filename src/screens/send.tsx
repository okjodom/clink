import { Feather } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { errorText } from "../lib/errors";
import { BRAND } from "../brand";
import { useMoney } from "../hooks";
import { parseAgentLink } from "../lib/links";
import { expandUsername } from "../lib/username";
import * as wallet from "../services/wallet";
import { useSession } from "../store/session";
import { useWallet } from "../store/wallet";
import { AmountDisplay, AmountPad, useAmountInput } from "../ui/amount";
import { Avatar, Button, Card, Field, Notice, Row, Screen, Section, Text, success } from "../ui/components";
import { toast } from "../ui/extras";
import { KeyValue } from "../ui/rows";
import { space, useColors } from "../ui/theme";

/** Looks like something payable, so it's worth offering from the clipboard. */
const PAYABLE = /^(lightning:|bitcoin:|lnbc|lntb|lnurl|bc1|tb1|sp1|spark1)|^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function SendScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const balance = useWallet((s) => s.balance);
  const ownAddress = useWallet((s) => s.lightningAddress);
  const recents = useSession((s) => s.recents);
  const money = useMoney();
  const input = useAmountInput();
  const c = useColors();
  const [text, setText] = useState<string>(route.params?.input ?? "");
  const [parsed, setParsed] = useState<wallet.ParsedInput | null>(null);
  const [prepared, setPrepared] = useState<wallet.PreparedSend | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Android reads the clipboard quietly, so offer what was just copied. (iOS would ask
  // permission every time; there the Paste button does it.)
  useEffect(() => {
    if (Platform.OS !== "android" || route.params?.input) return;
    Clipboard.getStringAsync()
      .then((v) => {
        const t = v.trim();
        if (t && t.length < 2000 && PAYABLE.test(t) && t !== ownAddress) setCopied(t);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parse = async (value: string) => {
    setError(null);
    setPrepared(null);
    if (!value.trim()) return;
    const agent = parseAgentLink(value);
    if (agent) {
      nav.replace("AgentProfile", { pk: agent });
      return;
    }
    setBusy(true);
    try {
      const p = await wallet.parseInput(expandUsername(value, ownAddress));
      setParsed(p);
      if (p.type === "bolt11") {
        if (!p.amountSats) throw new Error("This request has no amount. Ask for one with an amount.");
        setPrepared(await wallet.prepareSend(p));
      } else if (p.type !== "lnurl" && p.amountSats) {
        input.setSats(Number(p.amountSats));
      }
    } catch (e) {
      setParsed(null);
      const text = errorText(e);
      setError(
        text.startsWith("SdkError.InvalidInput") || text.includes("Unrecognized") || text.includes("parse")
          ? "We couldn't find anyone to pay there. Check the username or code."
          : text,
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (route.params?.input) void parse(route.params.input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.input]);

  const review = async () => {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      setPrepared(await wallet.prepareSend(parsed, BigInt(input.sats)));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!prepared || !parsed) return;
    setBusy(true);
    try {
      const tx = await prepared.send();
      success();
      if (parsed.type === "lnurl" && parsed.address) useSession.getState().addRecent(parsed.address);
      toast(tx.status === "complete" ? `Sent ${money.primary(tx.amountSats)}` : "Payment on its way", "success");
      void useWallet.getState().refresh();
      nav.goBack();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  // 1. who
  if (!parsed) {
    return (
      <Screen
        back
        title="Send"
        footer={<Button title="Continue" loading={busy} disabled={!text.trim()} onPress={() => parse(text)} />}
      >
        {copied && copied !== text && (
          <Card tone="primary" onPress={() => {
            setText(copied);
            void parse(copied);
          }} style={{ flexDirection: "row", alignItems: "center" }}>
            <Feather name="clipboard" size={20} color={c.primary} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label">Pay what you copied?</Text>
              <Text variant="caption" muted numberOfLines={1}>
                {copied.length > 36 ? `${copied.slice(0, 20)}…${copied.slice(-10)}` : copied}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={c.textMuted} />
          </Card>
        )}
        <Field
          label="Pay to"
          value={text}
          onChangeText={setText}
          placeholder="Username, or paste a payment code"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          error={error}
        />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button
            style={{ flex: 1 }}
            kind="secondary"
            icon="clipboard"
            title="Paste"
            onPress={async () => {
              const v = await Clipboard.getStringAsync();
              setText(v);
              void parse(v);
            }}
          />
          <Button style={{ flex: 1 }} kind="secondary" icon="maximize" title="Scan" onPress={() => nav.navigate("Scan")} />
        </View>
        {recents.length > 0 && (
          <Section title="Recent">
            <Card style={{ paddingVertical: space.sm, gap: 0 }}>
              {recents.map((r) => (
                <Row
                  key={r}
                  left={<Avatar pk={r} name={r} size={36} />}
                  title={r.split("@")[0]}
                  subtitle={r}
                  chevron
                  onPress={() => {
                    setText(r);
                    void parse(r);
                  }}
                />
              ))}
            </Card>
          </Section>
        )}
      </Screen>
    );
  }

  const dest =
    parsed.type === "lnurl" ? (parsed.address ?? "this wallet") : parsed.type === "bolt11" ? (parsed.description || "this payment request") : parsed.type === "spark" ? "this wallet" : parsed.address;

  // 2. how much
  if (!prepared) {
    const sats = input.sats;
    const tooMuch = balance !== null && sats > balance;
    const outOfRange = parsed.type === "lnurl" && sats > 0 && (BigInt(sats) < parsed.minSats || BigInt(sats) > parsed.maxSats);
    return (
      <Screen
        back
        title="Amount"
        scroll={false}
        footer={<Button title="Review" loading={busy} disabled={sats <= 0 || tooMuch || outOfRange} onPress={review} />}
      >
        <Text variant="caption" muted center numberOfLines={1}>
          To {dest}
        </Text>
        <AmountDisplay
          input={input}
          note={
            <>
              {tooMuch && <Text variant="caption" color={c.danger}>More than you have</Text>}
              {outOfRange && parsed.type === "lnurl" && (
                <Text variant="caption" faint>
                  Between {money.primary(parsed.minSats)} and {money.primary(parsed.maxSats)}
                </Text>
              )}
              {error && <Text variant="caption" color={c.danger}>{error}</Text>}
            </>
          }
        />
        <View style={{ flex: 1 }} />
        <AmountPad input={input} />
      </Screen>
    );
  }

  // 3. confirm
  const total = prepared.amountSats + prepared.feeSats;
  // A fee below about a percent isn't worth a line of its own.
  const smallFee = prepared.feeSats * 100n <= prepared.amountSats;
  return (
    <Screen back title="Confirm" footer={<Button title={`Send ${money.primary(prepared.amountSats)}`} loading={busy} onPress={confirm} />}>
      <View style={{ alignItems: "center", gap: 4, paddingVertical: space.xl }}>
        <Text variant="hero" adjustsFontSizeToFit numberOfLines={1}>
          {money.primary(prepared.amountSats)}
        </Text>
        {money.secondary(prepared.amountSats) && <Text muted>{money.secondary(prepared.amountSats)}</Text>}
      </View>
      <Card>
        <KeyValue label="To" value={dest} />
        {parsed.type === "bolt11" && parsed.description ? <KeyValue label="For" value={parsed.description} /> : null}
        <KeyValue label="Fee" value={prepared.feeSats === 0n ? "Free" : smallFee ? `${money.primary(prepared.feeSats)} (tiny)` : money.primary(prepared.feeSats)} />
        {!smallFee && <KeyValue label="Total" value={money.primary(total)} />}
      </Card>
      {balance !== null && total > BigInt(balance) && <Notice tone="danger">Not enough for this payment and its fee.</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
    </Screen>
  );
}

export function ScanScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [permission, request] = useCameraPermissions();
  const handled = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void request();
  }, [permission, request]);

  const onCode = (data: string) => {
    if (handled.current) return;
    handled.current = true;
    success();
    const agent = parseAgentLink(data);
    if (agent) nav.replace("AgentProfile", { pk: agent });
    else nav.replace("Send", { input: data });
  };

  if (!permission?.granted) {
    return (
      <Screen back title="Scan">
        <Notice tone="info" title="Camera access needed" action={<Button small title="Allow camera" onPress={() => void request()} />}>
          {`${BRAND.name} uses the camera only to read QR codes.`}
        </Notice>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => onCode(data)}
      />
      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]} pointerEvents="none">
        <View style={{ width: 250, height: 250, borderRadius: 28, borderWidth: 3, borderColor: "rgba(255,255,255,0.9)" }} />
        <Text variant="label" color="#ffffff" style={{ marginTop: space.xl }}>
          Point at a payment code
        </Text>
      </View>
      <Pressable
        onPress={() => nav.goBack()}
        style={{ position: "absolute", top: insets.top + 12, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}
      >
        <Feather name="x" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}
