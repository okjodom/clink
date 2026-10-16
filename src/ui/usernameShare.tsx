import React, { useState } from "react";
import { useWallet } from "../store/wallet";
import { IconButton } from "./components";
import { QrShareSheet } from "./extras";

export function UsernameShareButton() {
  const address = useWallet((s) => s.lightningAddress);
  const [open, setOpen] = useState(false);
  if (!address) return null;
  return <>
    <IconButton name="qr-code" label="Show payment QR" onPress={() => setOpen(true)} />
    <QrShareSheet
      visible={open}
      onClose={() => setOpen(false)}
      title={address}
      caption="Anyone can scan this to pay you. Save it to print or share."
      value={address}
      fileName={address.split("@")[0]}
    />
  </>;
}
