import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useMoney } from "../hooks";
import { errorText } from "../lib/errors";
import { formatSats } from "../lib/money";
import { approveDepositClaim, prepareDepositClaim, type DepositClaimReview, type DepositClaimResult } from "../services/depositClaims";
import { useWallet } from "../store/wallet";
import { Button, Card, Notice, Spinner, Text } from "./components";
import { Sheet } from "./extras";
import { KeyValue } from "./rows";
import { space } from "./theme";

export function DepositClaimAction({ id, onChange }: { id: string; onChange: () => Promise<void> }) {
  const money = useMoney();
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<DepositClaimReview>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DepositClaimResult>();
  const version = useRef(0);
  const approving = useRef(false);
  useEffect(() => () => { version.current++; }, []);
  const close = () => { if (approving.current) return; version.current++; setOpen(false); };
  const quote = async () => {
    const request = ++version.current;
    setOpen(true); setReview(undefined); setError(undefined); setLoading(true);
    try {
      const next = await prepareDepositClaim(id);
      if (request === version.current) setReview(next);
    } catch (cause) { if (request === version.current) setError(errorText(cause)); }
    finally { if (request === version.current) setLoading(false); }
  };
  const approve = async () => {
    if (!review || approving.current) return;
    approving.current = true; setBusy(true);
    const request = version.current;
    try {
      const outcome = await approveDepositClaim(review);
      if (request === version.current) { setResult(outcome); setOpen(false); }
      await useWallet.getState().refresh();
      await onChange();
    } catch (cause) {
      if (request === version.current) { setReview(undefined); setError(errorText(cause)); }
      // An uncertain response is never retried automatically. Re-read SDK state.
      await useWallet.getState().refresh();
      await onChange();
    } finally { approving.current = false; if (request === version.current) setBusy(false); }
  };
  const amount = (sats: bigint) => money.unit === "sats" ? formatSats(sats) : `${money.primary(sats)} · ${formatSats(sats)}`;
  return <>
    {result && !(result.status === "waiting" && result.feeChanged) ? (
      <Notice tone={result.status === "complete" ? "success" : "info"} title={result.status === "complete" ? "Added to your wallet" : "Adding to your balance"}>
        {result.status === "complete" ? "The deposit is now available." : "Your fee approval is saved. The wallet will finish adding this deposit automatically."}
      </Notice>
    ) : <Button title={result ? "Review updated deposit fee" : "Review deposit fee"} icon="check-circle" onPress={() => void quote()} />}
    <Sheet visible={open} onClose={close} title="Add to your wallet">
      {loading ? <Spinner label="Checking deposit fee…" /> : error ? (
        <Notice tone="warning" title="Couldn't prepare this deposit" action={<Button small title="Check again" onPress={() => void quote()} />}>{error}</Notice>
      ) : review ? <View style={{ gap: space.lg }}>
        <Card>
          <KeyValue label="Deposit" value={amount(review.amountSats)} />
          <KeyValue label="Maximum fee" value={amount(review.feeSats)} />
          <KeyValue label="You receive at least" value={amount(review.receiveSats)} />
        </Card>
        <Text variant="caption" muted>The fee comes out of this deposit. It only applies to this transaction.</Text>
        <Button title="Approve fee & add" loading={busy} onPress={() => void approve()} />
      </View> : null}
    </Sheet>
  </>;
}
