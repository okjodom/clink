import { useNavigation } from "@react-navigation/native";
import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { errorText } from "../lib/errors";
import { formatUsd } from "../lib/stablecoins";
import * as wallet from "../services/wallet";
import { useWallet } from "../store/wallet";
import { Button, Card, Chip, Notice, Screen, Spinner, Text } from "../ui/components";
import { CopyField, NumPad, QR } from "../ui/extras";
import { space, useColors } from "../ui/theme";

/** Networks shown before "More". */
const COMMON = 4;

/**
 * Get paid in USDT or USDC from another chain: pick the coin and network the
 * sender uses, say how much, and share a one-off address.
 */
export function ReceiveStablecoinScreen() {
  const nav = useNavigation<any>();
  const c = useColors();
  const holdIn = useWallet((s) => s.holdIn);
  const [routes, setRoutes] = useState<wallet.StableRoute[] | null>(null);
  const [asset, setAsset] = useState("USDT");
  const [chain, setChain] = useState<string | null>(null);
  const [usd, setUsd] = useState("0");
  const [request, setRequest] = useState<wallet.StablecoinRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [allChains, setAllChains] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    wallet
      .stablecoinReceiveRoutes()
      .then((r) => {
        setRoutes(r);
        if (r.length && !r.some((x) => x.asset === asset)) setAsset(r[0].asset);
      })
      .catch((e) => setError(errorText(e)));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  // Close once the money lands; the app-wide moment shows what arrived.
  useEffect(() => {
    if (!request) return;
    return wallet.onWalletEvent((e) => {
      if (e.type === "payment" && e.payment.direction === "in" && e.payment.status === "complete") nav.goBack();
    });
  }, [request, nav]);

  const assets = useMemo(() => [...new Set((routes ?? []).map((r) => r.asset))], [routes]);
  const forAsset = useMemo(() => (routes ?? []).filter((r) => r.asset === asset), [routes, asset]);
  const route = forAsset.find((r) => r.chain === chain) ?? forAsset[0];
  const amount = Number(usd) || 0;
  const tooSmall = !!route && route.minUsd !== undefined && amount > 0 && amount < route.minUsd;
  const tooBig = !!route && route.maxUsd !== undefined && amount > route.maxUsd;

  if (request && route) {
    const until = new Date(request.expiresAt * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return (
      <Screen back title={`Get ${route.asset}`} footer={<Button title="Done" kind="secondary" onPress={() => nav.goBack()} />}>
        <Card style={{ alignItems: "center", gap: space.lg }}>
          <QR value={request.paymentRequest} />
          <View style={{ alignItems: "center", gap: 2 }}>
            <Text variant="title" adjustsFontSizeToFit numberOfLines={1}>{`Send ${request.sendAmount} ${route.asset}`}</Text>
            <Text variant="caption" muted center>
              {`${route.label}, to this address`}
            </Text>
          </View>
        </Card>
        <CopyField value={request.depositAddress} label="Address" />
        <Notice tone="warning" title={`Only ${route.label}`}>
          {`Use this address once, for this amount, before ${until}. Other coins or networks sent here are lost.`}
        </Notice>
        <Text variant="caption" muted center>
          {holdIn === "dollars" ? "It arrives in your dollars." : "It arrives in your balance as bitcoin."}
        </Text>
      </Screen>
    );
  }

  if (!routes) {
    return (
      <Screen back title="Get USDT or USDC">
        {error ? (
          <Notice tone="danger" action={<Button small kind="secondary" title="Try again" onPress={load} />}>
            {error}
          </Notice>
        ) : (
          <Spinner label="Finding networks" />
        )}
      </Screen>
    );
  }

  if (!route) {
    return (
      <Screen back title="Get USDT or USDC">
        <Notice tone="info">USDT and USDC can't be received right now. Try again later.</Notice>
      </Screen>
    );
  }

  return (
    <Screen
      back
      title="Get USDT or USDC"
      scroll={false}
      footer={
        <Button
          title="Get address"
          loading={busy}
          disabled={amount <= 0 || tooSmall || tooBig}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              setRequest(await wallet.requestStablecoin(route, usd));
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      }
    >
      {assets.length > 1 && (
        <View style={{ flexDirection: "row", gap: space.sm, justifyContent: "center" }}>
          {assets.map((a) => (
            <Chip key={a} label={a} selected={a === asset} onPress={() => setAsset(a)} />
          ))}
        </View>
      )}
      <Text variant="caption" muted center>
        Which network is the sender using?
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, justifyContent: "center" }}>
        {/* The common networks first; the rest are one tap away. */}
        {forAsset
          .filter((r, i) => allChains || i < COMMON || r.chain === route.chain)
          .map((r) => (
            <Chip key={r.chain} label={r.label.split(" on ")[1]} selected={r.chain === route.chain} onPress={() => setChain(r.chain)} />
          ))}
        {!allChains && forAsset.length > COMMON + 1 && <Chip label="More" icon="chevron-down" onPress={() => setAllChains(true)} />}
      </View>
      <View style={{ alignItems: "center", gap: 4, paddingVertical: space.md }}>
        <Text variant="hero" adjustsFontSizeToFit numberOfLines={1}>
          ${usd}
        </Text>
        <Text variant="caption" color={tooSmall || tooBig || error ? c.danger : c.textMuted}>
          {error ??
            (tooSmall ? `At least ${formatUsd(route.minUsd!)}` : tooBig ? `At most ${formatUsd(route.maxUsd!)}` : `How much you want to get, in ${route.asset}`)}
        </Text>
      </View>
      <View style={{ flex: 1 }} />
      <NumPad value={usd} onChange={setUsd} decimals={2} max={9} />
    </Screen>
  );
}
