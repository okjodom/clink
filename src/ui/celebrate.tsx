/**
 * The Clink moment, when money lands. Two coins, bitcoin and the local
 * currency, slide in and touch; on contact the phone clinks (sound and
 * haptic) and a spark pops where they meet, so the logo builds itself.
 * Plays once; people who turned animations off see the end state and still
 * hear the clink.
 */
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, Share, View } from "react-native";
import { create } from "zustand";

import { BRAND } from "../brand";
import { Spark, Text, Wordmark, success } from "./components";
import { clink } from "./sound";
import { useColors, useIsDark } from "./theme";

const SPARKS = 12;
const COIN = 72;
const SIZE = 132;
/** How long the coins take to meet; the clink plays on contact. */
const MEET_MS = 480;

export function SwapCelebration({
  fiatCode,
  amountLabel,
  caption,
  play,
  onBrand = false,
}: {
  fiatCode: string;
  amountLabel: string;
  caption?: string;
  play: boolean;
  /** Drawn on the full-screen gold takeover rather than the page. */
  onBrand?: boolean;
}) {
  const c = useColors();
  // On gold the ink carries everything; on the page the coins stay ink and the text follows the theme.
  const ink = onBrand ? c.primaryText : c.text;
  const coinInk = "#14110f";
  // Ink coins vanish on a dark page, so there they flip to gold with ink detail.
  const dark = useIsDark();
  const flip = !onBrand && dark;
  const coinFill = flip ? c.primary : coinInk;
  const coinDetail = flip ? coinInk : c.primary;
  const gold = c.primary;
  const halo = onBrand ? c.primary : c.bg;
  const meet = useRef(new Animated.Value(play ? 0 : 1)).current;
  const pop = useRef(new Animated.Value(play ? 0 : 1)).current;
  const burst = useRef(new Animated.Value(play ? 0 : 1)).current;
  const [sparks] = useState(() =>
    Array.from({ length: SPARKS }, (_, i) => ({
      angle: (i / SPARKS) * Math.PI * 2 + (i % 2 ? 0.12 : -0.08),
      reach: 64 + ((i * 37) % 30),
      size: 5 + (i % 3) * 2,
      light: i % 3 === 0,
    })),
  );

  useEffect(() => {
    if (!play) return;
    let alive = true;
    const contact = () => {
      clink();
      success();
    };
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive) return;
      if (reduce) {
        meet.setValue(1);
        pop.setValue(1);
        burst.setValue(1);
        contact();
        return;
      }
      meet.setValue(0);
      pop.setValue(0);
      burst.setValue(0);
      Animated.sequence([
        Animated.timing(meet, { toValue: 1, duration: MEET_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.parallel([
          Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
          Animated.timing(burst, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      ]).start();
      setTimeout(() => alive && contact(), MEET_MS);
    });
    return () => {
      alive = false;
    };
  }, [play, meet, pop, burst]);

  // Coins end edge to edge on a slight tilt, like the logo: left low, right high.
  const coin = (side: -1 | 1, label: string) => (
    <Animated.View
      style={{
        position: "absolute",
        width: COIN,
        height: COIN,
        borderRadius: COIN / 2,
        backgroundColor: coinFill,
        alignItems: "center",
        justifyContent: "center",
        transform: [
          { translateX: meet.interpolate({ inputRange: [0, 1], outputRange: [side * 110, side * (COIN / 2) * 0.93] }) },
          { translateY: meet.interpolate({ inputRange: [0, 1], outputRange: [0, -side * (COIN / 2) * 0.37] }) },
          { rotate: meet.interpolate({ inputRange: [0, 1], outputRange: [`${side * -40}deg`, "0deg"] }) },
        ],
      }}
    >
      <View style={{ position: "absolute", width: COIN * 0.72, height: COIN * 0.72, borderRadius: COIN, borderWidth: 3, borderColor: coinDetail }} />
      <Text variant="label" color={coinDetail}>
        {label}
      </Text>
    </Animated.View>
  );

  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 8 }} accessible accessibilityLabel={`Clink! ${amountLabel}${caption ? `. ${caption}` : ""}`}>
      <View style={{ width: SIZE * 2, height: SIZE + 24, alignItems: "center", justifyContent: "center" }}>
        {sparks.map((s, i) => (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              width: s.size,
              height: s.size,
              borderRadius: s.size,
              backgroundColor: s.light ? (onBrand ? "#fbf6ec" : gold) : coinInk,
              opacity: burst.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
              transform: [
                { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(s.angle) * s.reach] }) },
                { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(s.angle) * s.reach] }) },
                { scale: burst.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.2, 0.6] }) },
              ],
            }}
          />
        ))}
        {coin(-1, "\u20bf")}
        {coin(1, fiatCode)}
        <Animated.View
          style={{
            position: "absolute",
            alignItems: "center",
            justifyContent: "center",
            opacity: pop,
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }, { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ["-45deg", "0deg"] }) }],
          }}
        >
          <Spark size={52} color={halo} />
          <View style={{ position: "absolute" }}>
            <Spark size={40} color={onBrand ? "#fbf6ec" : gold} />
          </View>
        </Animated.View>
      </View>
      <Animated.View style={{ alignItems: "center", gap: 2, opacity: pop, transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
        {onBrand && (
          <Text variant="hero" color={ink} style={{ fontSize: 64, letterSpacing: -2 }}>
            Clink!
          </Text>
        )}
        <Text variant={onBrand ? "display" : "title"} color={ink}>
          {amountLabel}
        </Text>
        {caption ? (
          <Text variant={onBrand ? "body" : "caption"} color={onBrand ? ink : undefined} muted={!onBrand} center>
            {caption}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

// -- full-screen moment ------------------------------------------------------------

export interface Moment {
  fiatCode: string;
  amountLabel: string;
  caption: string;
  /** Small caps line above the animation. */
  label?: string;
  /** Opt-in brag: a Share button with this text. */
  share?: string;
}

const useMoment = create<{ current: Moment | null }>(() => ({ current: null }));

/** Take over the screen for a couple of seconds, wherever the person is in the app. */
export function celebrate(m: Moment) {
  useMoment.setState({ current: m });
}

export function CelebrationHost() {
  const current = useMoment((s) => s.current);
  const c = useColors();
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!current) return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const t = setTimeout(() => close(), current.share ? 5000 : 2800);
    return () => clearTimeout(t);
  }, [current]);
  const close = () => Animated.timing(fade, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => useMoment.setState({ current: null }));
  if (!current) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <Animated.View style={{ flex: 1, opacity: fade, backgroundColor: c.primary }}>
        <Pressable onPress={close} style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 }} accessibilityRole="button" accessibilityLabel="Close">
          <Text variant="label" color={c.primaryText} style={{ opacity: 0.75, letterSpacing: 1 }}>
            {current.label ?? "SWAP COMPLETE"}
          </Text>
          <SwapCelebration play onBrand fiatCode={current.fiatCode} amountLabel={current.amountLabel} caption={current.caption} />
        </Pressable>
        {current.share ? (
          <Pressable
            onPress={() => void Share.share({ message: current.share! })}
            style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, backgroundColor: "rgba(20,17,15,0.12)", marginBottom: 16 }}
          >
            <Feather name="share" size={16} color={c.primaryText} />
            <Text variant="label" color={c.primaryText}>
              Tell a friend
            </Text>
          </Pressable>
        ) : null}
        <View style={{ alignItems: "center", paddingBottom: 48, opacity: 0.85 }} accessibilityLabel={BRAND.name}>
          <Wordmark height={22} color={c.primaryText} dot={c.primaryText} />
        </View>
      </Animated.View>
    </Modal>
  );
}
