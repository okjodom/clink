/**
 * Amount entry in the person's own money. They type KES (or whatever they
 * display); the wallet works out the sats. Sats stay one tap away.
 */
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { currencyInfo } from "../lib/channels";
import { formatDecimal, formatSats } from "../lib/money";
import { useSession } from "../store/session";
import { useWallet } from "../store/wallet";
import { Text, tap } from "./components";
import { NumPad } from "./extras";
import { space, useColors } from "./theme";

export interface AmountInput {
  unit: "fiat" | "sats";
  text: string;
  sats: number;
  currency: string;
  /** The other unit, e.g. "4,210 sats" while typing KES. */
  other: string | null;
  decimals: number;
  setText(t: string): void;
  setSats(sats: number): void;
  toggle(): void;
}

export function useAmountInput(initialSats = 0): AmountInput {
  const currency = useSession((s) => s.currency);
  const preferSats = useSession((s) => s.preferSats);
  const rate = useWallet((s) => s.rates[currency]);
  const info = currencyInfo(currency);
  const [unit, setUnit] = useState<"fiat" | "sats">(rate && !preferSats ? "fiat" : "sats");
  const [text, setText] = useState("0");
  const touched = useRef(false);

  const toFiatText = (sats: number) => (rate ? fiatText((sats / 1e8) * rate, info.decimals) : "0");
  const sats = unit === "sats" ? Number(text) || 0 : rate ? Math.floor(((Number(text) || 0) / rate) * 1e8) : 0;

  // Rates can arrive after the screen opens: switch to local money if nothing was typed yet.
  useEffect(() => {
    if (rate && !preferSats && unit === "sats" && !touched.current && text === "0") setUnit("fiat");
  }, [rate, preferSats, unit, text]);

  const setSats = (n: number) => {
    touched.current = true;
    setText(unit === "fiat" && rate ? toFiatText(n) : String(Math.max(0, Math.trunc(n))));
  };

  useEffect(() => {
    if (initialSats > 0) setSats(initialSats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    unit,
    text,
    sats,
    currency,
    decimals: unit === "fiat" ? info.decimals : 0,
    other: !rate ? null : unit === "fiat" ? formatSats(sats) : `${currency} ${formatDecimal(toFiatText(sats), info.decimals)}`,
    setText(t) {
      touched.current = true;
      setText(t);
    },
    setSats,
    toggle() {
      if (!rate) return;
      touched.current = true;
      const next = unit === "fiat" ? "sats" : "fiat";
      setUnit(next);
      setText(next === "fiat" ? toFiatText(sats) : String(sats));
    },
  };
}

function fiatText(n: number, decimals: number): string {
  if (!(n > 0)) return "0";
  const f = 10 ** decimals;
  const v = Math.round(n * f) / f;
  return decimals ? String(Number(v.toFixed(decimals))) : String(Math.round(v));
}

/** The big figure plus a tap-to-flip line for the other unit. */
export function AmountDisplay({ input, note }: { input: AmountInput; note?: React.ReactNode }) {
  const c = useColors();
  const { text, unit, currency, other } = input;
  const shown = formatDecimal(text.endsWith(".") ? text.slice(0, -1) : text) + (text.endsWith(".") ? "." : "");
  return (
    <View style={{ alignItems: "center", gap: 4, paddingVertical: space.lg }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        {unit === "fiat" && (
          <Text variant="heading" muted style={{ marginBottom: 8 }}>
            {currency}
          </Text>
        )}
        <Text variant="hero" adjustsFontSizeToFit numberOfLines={1} style={{ flexShrink: 1 }}>
          {shown}
        </Text>
        {unit === "sats" && (
          <Text variant="heading" muted style={{ marginBottom: 8 }}>
            sats
          </Text>
        )}
      </View>
      {other ? (
        <Pressable
          onPress={() => {
            tap();
            input.toggle();
          }}
          hitSlop={10}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          accessibilityRole="button"
          accessibilityLabel={unit === "fiat" ? "Enter in sats" : `Enter in ${currency}`}
        >
          <Text muted>≈ {other}</Text>
          <Feather name="repeat" size={13} color={c.textMuted} />
        </Pressable>
      ) : null}
      {note}
    </View>
  );
}

export function AmountPad({ input }: { input: AmountInput }) {
  return <NumPad value={input.text} onChange={input.setText} decimals={input.decimals} max={input.unit === "fiat" ? 9 : 10} />;
}
