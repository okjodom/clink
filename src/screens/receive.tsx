import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import React, { useEffect, useState } from "react";
import { Pressable, Share, View } from "react-native";

import { BRAND } from "../brand";
import { useMoney } from "../hooks";
import * as wallet from "../services/wallet";
import { useSession } from "../store/session";
import { useWallet } from "../store/wallet";
import { AmountDisplay, AmountPad, useAmountInput } from "../ui/amount";
import { Button, Card, Field, Screen, Spinner, Text, success } from "../ui/components";
import { CopyField, QR, Sheet, toastError } from "../ui/extras";
import { space, useColors } from "../ui/theme";

/**
 * One code to get paid. With a username that's a reusable code anyone can pay
 * any time; asking for an amount swaps in a one-off request.
 */
export function ReceiveScreen() {
  const nav = useNavigation<any>();
  const c = useColors();
  const { lightningAddress: address, lnurl } = useWallet();
  const money = useMoney();
  const input = useAmountInput();
  const [requested, setRequested] = useState(0);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amountOpen, setAmountOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const makeInvoice = async (sats: number) => {
    setBusy(true);
    try {
      setInvoice(await wallet.receiveInvoice(sats > 0 ? BigInt(sats) : undefined, BRAND.name));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  // Without a username, fall back to an open-amount request.
  useEffect(() => {
    if (!lnurl && !invoice) void makeInvoice(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lnurl]);

  // Close once money lands; the app-wide moment shows what arrived.
  useEffect(() => {
    const startedAt = Math.floor(Date.now() / 1000);
    return wallet.onWalletEvent((e) => {
      if (e.type === "payment" && e.payment.direction === "in" && e.payment.status === "complete" && e.payment.timestamp >= startedAt - 5) {
        nav.goBack();
      }
    });
  }, [nav]);

  const useInvoice = requested > 0 || !lnurl;
  const code = useInvoice ? invoice : lnurl;
  const qrValue = code ? `lightning:${code}`.toUpperCase() : null;
  const asked = requested > 0 ? money.primary(requested) : null;
  const shareText = useInvoice
    ? `${asked ? `Pay me ${asked}` : "Pay me"} with ${BRAND.name}: ${invoice ?? ""}`
    : `Pay me on ${BRAND.name}: ${address}`;

  return (
    <Screen back title="Receive">
      <Card style={{ alignItems: "center", gap: space.lg }}>
        {qrValue && !busy ? <QR value={qrValue} /> : <Spinner />}
        <View style={{ alignItems: "center", gap: 2 }}>
          {asked ? (
            <>
              <Text variant="title">{asked}</Text>
              <Text variant="caption" muted>
                {money.secondary(requested) ?? ""}
              </Text>
            </>
          ) : address ? (
            <>
              <Text variant="heading" center selectable>
                {address}
              </Text>
              <Text variant="caption" muted center>
                Anyone can pay you here, any time
              </Text>
            </>
          ) : (
            <Text variant="heading">Any amount</Text>
          )}
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button
          style={{ flex: 1 }}
          kind="secondary"
          icon={requested ? "x" : "edit-3"}
          title={requested ? "Clear amount" : "Ask for amount"}
          onPress={() => {
            if (requested) {
              setRequested(0);
              setInvoice(null);
              if (!lnurl) void makeInvoice(0);
            } else setAmountOpen(true);
          }}
        />
        <Button style={{ flex: 1 }} icon="share" title="Share" disabled={!code} onPress={() => void Share.share({ message: shareText })} />
      </View>

      {useInvoice && invoice && <CopyField value={invoice} short label="Payment request" />}
      {!useInvoice && address && <CopyField value={address} label="Your username" />}

      {!address && (
        <Card tone="alt">
          <Text variant="label">Get a username</Text>
          <Text variant="caption" muted>
            A name like an email, so people can pay you any time without a new code.
          </Text>
          <Button small kind="secondary" title="Pick my username" onPress={() => setClaimOpen(true)} />
        </Card>
      )}

      <Pressable onPress={() => setMoreOpen(true)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: space.md }}>
        <Text variant="label" color={c.textMuted}>
          More ways to receive
        </Text>
        <Feather name="chevron-right" size={16} color={c.textMuted} />
      </Pressable>

      <Sheet visible={amountOpen} onClose={() => setAmountOpen(false)} title="Ask for an amount">
        <AmountDisplay input={input} />
        <AmountPad input={input} />
        <Button
          title="Done"
          disabled={input.sats <= 0}
          onPress={() => {
            setAmountOpen(false);
            setRequested(input.sats);
            void makeInvoice(input.sats);
          }}
        />
      </Sheet>
      <ClaimAddressSheet visible={claimOpen} onClose={() => setClaimOpen(false)} />
      <OnchainSheet visible={moreOpen} onClose={() => setMoreOpen(false)} />
    </Screen>
  );
}

/** A plain bitcoin address, for exchanges and wallets that only send on-chain. */
function OnchainSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    if (visible && !address) wallet.bitcoinAddress().then(setAddress).catch(toastError);
  }, [visible, address]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Bitcoin address">
      <Text variant="caption" muted>
        For exchanges and wallets that can only send on-chain. It takes a few confirmations to arrive and carries a network fee.
      </Text>
      {address ? (
        <>
          <QR value={`bitcoin:${address}`} size={180} />
          <CopyField value={address} short />
        </>
      ) : (
        <Spinner />
      )}
    </Sheet>
  );
}

export function ClaimAddressSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const profileName = useSession((s) => s.profile.name);
  const [name, setName] = useState(wallet.usernameFrom(profileName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet visible={visible} onClose={onClose} title="Pick your username">
      <Field
        value={name}
        onChangeText={(t) => {
          setName(t);
          setError(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="jane"
        error={error}
        hint="People pay you at this name."
      />
      <Button
        title="Claim"
        loading={busy}
        disabled={name.length < 3}
        onPress={async () => {
          setBusy(true);
          try {
            const a = await wallet.claimLightningAddress(name);
            useWallet.getState().setLightningAddress(a.address, a.lnurl);
            success();
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </Sheet>
  );
}
