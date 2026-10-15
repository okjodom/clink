import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import QRCode from "react-qr-code";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { create } from "zustand";

import { errorText } from "../lib/errors";
import { BRAND } from "../brand";
import { captureImage, shareImage } from "../services/shareImage";
import { radius, space, useColors } from "./theme";
import { Button, Text, tap, success } from "./components";

// -- number pad ------------------------------------------------------------------

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];

export function NumPad({ value, onChange, decimals = 2, max = 12 }: { value: string; onChange: (v: string) => void; decimals?: number; max?: number }) {
  const c = useColors();
  const press = (k: string) => {
    tap();
    if (k === "del") return onChange(value.length <= 1 ? "0" : value.slice(0, -1));
    if (k === ".") {
      if (decimals === 0 || value.includes(".")) return;
      return onChange(value + ".");
    }
    const [, frac] = value.split(".");
    if (frac !== undefined && frac.length >= decimals) return;
    if (value.replace(".", "").length >= max) return;
    onChange(value === "0" ? k : value + k);
  };
  return (
    <View style={styles.pad}>
      {KEYS.map((k) => (
        <Pressable
          key={k}
          onPress={() => press(k)}
          onLongPress={k === "del" ? () => onChange("0") : undefined}
          style={({ pressed }) => [styles.key, { opacity: pressed ? 0.65 : 1 }]}
          disabled={k === "." && decimals === 0}
        >
          {k === "del" ? (
            <Feather name="delete" size={24} color={c.text} />
          ) : (
            <Text variant="title" style={{ fontWeight: "500", opacity: k === "." && decimals === 0 ? 0 : 1 }}>
              {k}
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

// -- sheet -------------------------------------------------------------------------

export function Sheet({ visible, onClose, title, right, children }: { visible: boolean; onClose: () => void; title?: string; right?: React.ReactNode; children: React.ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(400)).current;
  useEffect(() => {
    if (!visible) {
      y.setValue(400);
      return;
    }
    const animation = Platform.OS === "android"
      ? Animated.timing(y, { toValue: 0, duration: 180, useNativeDriver: true })
      : Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 });
    animation.start();
    return () => animation.stop();
  }, [visible, y]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType={Platform.OS === "android" ? "none" : "fade"}
      // The first BACK should only hide the keyboard, as it does everywhere else.
      onRequestClose={() => (Keyboard.isVisible() ? Keyboard.dismiss() : onClose())}
      statusBarTranslucent
    >
      {/* A modal is its own window, so Android's adjustResize never reaches it: pad on both platforms. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} onPress={onClose} />
        <View style={{ flex: 1 }} pointerEvents="box-none" />
        <Animated.View
          style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, space.lg), transform: [{ translateY: y }] }]}
        >
          <View style={[styles.grabber, { backgroundColor: c.border }]} />
          {(title || right) && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, marginBottom: space.sm }}>
              {title && <Text variant="title" style={{ flexShrink: 1 }}>{title}</Text>}
              {right}
            </View>
          )}
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// -- QR + copy ---------------------------------------------------------------------

/** A QR code to show or save as an image: for a shop counter, a poster or a group. */
export function QrShareSheet({ visible, onClose, title, caption, value, fileName, share = false }: { visible: boolean; onClose: () => void; title: string; caption: string; value: string; fileName: string; share?: boolean }) {
  const ref = useRef<Svg>(null);
  const [saving, setSaving] = useState(false);
  const imageHeight = share ? 340 : 280;
  const save = async () => {
    if (saving || !ref.current) return;
    setSaving(true);
    try {
      const b64 = await captureImage(ref.current, 1024, Math.round(1024 * imageHeight / 280));
      const { Directory } = await import("expo-file-system");
      const dir = await Directory.pickDirectoryAsync();
      const name = fileName.replace(/[^a-z0-9@._-]/gi, "_").replace(/^\.+/, "") || "qr-code";
      dir.createFile(`${name}.png`, "image/png").write(b64, { encoding: "base64" });
      toast("QR code saved", "success");
    } catch (e) {
      if (!/cancel/i.test(String(e))) toastError(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <Text variant="caption" muted>
        {caption}
      </Text>
      <View style={[styles.qr, { padding: 0 }]}>
        {/* Keep the white quiet zone inside the exported image, not just the surrounding View. */}
        <Svg ref={ref} width={share ? 240 : 280} height={share ? 291 : 280} viewBox={`0 0 280 ${imageHeight}`}>
          <Rect width={280} height={imageHeight} fill="#ffffff" />
          <G transform="translate(40 40)">
            <QRCode value={value} size={200} bgColor="#ffffff" fgColor="#14110f" />
          </G>
          {share && <>
            <SvgText x={140} y={299} textAnchor="middle" fontSize={14} fontWeight="600" fill="#14110f" textLength={value.length > 30 ? 250 : undefined} lengthAdjust="spacingAndGlyphs">{value}</SvgText>
            <SvgText x={140} y={325} textAnchor="middle" fontSize={12} fill="#5e564c">{`Pay me back on ${BRAND.name}`}</SvgText>
          </>}
        </Svg>
      </View>
      <Button title="Save QR code" icon="download" onPress={save} loading={saving} />
      {share && <Button title="Share QR image" icon="share-2" kind="secondary" disabled={saving} onPress={async () => {
        if (!ref.current || saving) return;
        setSaving(true);
        try { await shareImage(ref.current, fileName, 1080, Math.round(1080 * imageHeight / 280)); }
        catch (error) { toastError(error); }
        finally { setSaving(false); }
      }} />}
    </Sheet>
  );
}

export function QR({ value, size = 220 }: { value: string; size?: number }) {
  return (
    <View style={styles.qr}>
      <QRCode value={value} size={size} bgColor="#ffffff" fgColor="#14110f" />
    </View>
  );
}

/** `display` is shown instead of `value` (e.g. masked); `value` is what gets copied. */
export function CopyField({ value, label, short, display }: { value: string; label?: string; short?: boolean; display?: string }) {
  const c = useColors();
  const [copied, setCopied] = useState(false);
  const text = display ?? value;
  const shown = short && text.length > 28 ? `${text.slice(0, 14)}…${text.slice(-10)}` : text;
  return (
    <Pressable
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        success();
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={[styles.copy, { backgroundColor: c.surface, borderColor: c.border }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        {label && (
          <Text variant="caption" muted>
            {label}
          </Text>
        )}
        <Text variant="label" numberOfLines={short ? 1 : 4} selectable>
          {shown}
        </Text>
      </View>
      <Feather name={copied ? "check" : "copy"} size={18} color={copied ? c.primaryInk : c.textMuted} />
    </Pressable>
  );
}

/** Just the copy icon, for a value already shown beside it. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const c = useColors();
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copied ? "Copied" : label}
      hitSlop={12}
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        success();
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={[styles.copyIcon, { backgroundColor: c.surfaceAlt }]}
    >
      <Feather name={copied ? "check" : "copy"} size={16} color={copied ? c.primaryInk : c.textMuted} />
    </Pressable>
  );
}

// -- toast ---------------------------------------------------------------------------

type ToastKind = "success" | "error" | "info";
const useToastStore = create<{ msg: string | null; kind: ToastKind; n: number }>(() => ({ msg: null, kind: "info", n: 0 }));

export function toast(msg: string, kind: ToastKind = "info") {
  useToastStore.setState((s) => ({ msg, kind, n: s.n + 1 }));
}

export function toastError(e: unknown) {
  toast(errorText(e), "error");
}

// -- confirm -----------------------------------------------------------------------

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" for irreversible or destructive steps. */
  tone?: "primary" | "danger";
  icon?: React.ComponentProps<typeof Feather>["name"];
}

type ConfirmState = (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
const useConfirmStore = create<{ current: ConfirmState }>(() => ({ current: null }));

/** An in-app confirmation sheet in the app's own look, instead of the platform alert. */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.getState().current?.resolve(false);
    useConfirmStore.setState({ current: { ...opts, resolve } });
  });
}

export function dismissConfirm() {
  useConfirmStore.getState().current?.resolve(false);
  useConfirmStore.setState({ current: null });
}

export function ConfirmHost() {
  const current = useConfirmStore((s) => s.current);
  const c = useColors();
  const done = (ok: boolean) => {
    current?.resolve(ok);
    useConfirmStore.setState({ current: null });
  };
  const danger = current?.tone === "danger";
  return (
    <Sheet visible={!!current} onClose={() => done(false)}>
      {current && (
        <View style={{ gap: space.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: danger ? c.dangerSoft : c.primarySoft }}>
              <Feather name={current.icon ?? (danger ? "alert-triangle" : "check-circle")} size={20} color={danger ? c.danger : c.primaryInk} />
            </View>
            <Text variant="title" style={{ flex: 1 }}>
              {current.title}
            </Text>
          </View>
          <Text muted>{current.message}</Text>
          <View style={{ gap: space.sm }}>
            <Button kind={danger ? "danger" : "primary"} title={current.confirmLabel} onPress={() => done(true)} />
            <Button kind="secondary" title={current.cancelLabel ?? "Not now"} onPress={() => done(false)} />
          </View>
        </View>
      )}
    </Sheet>
  );
}

export function ToastHost() {
  const { msg, kind, n } = useToastStore();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!msg) return;
    Animated.sequence([
      Animated.spring(v, { toValue: 1, useNativeDriver: true }),
      Animated.delay(kind === "error" ? 3600 : 2200),
      Animated.timing(v, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [n, msg, kind, v]);
  if (!msg) return null;
  const icon = kind === "success" ? "check-circle" : kind === "error" ? "alert-circle" : "info";
  const color = kind === "success" ? c.primary : kind === "error" ? c.danger : c.info;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        {
          top: insets.top + 8,
          backgroundColor: c.hero,
          opacity: v,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }],
        },
      ]}
    >
      <Feather name={icon} size={18} color={color} />
      <Text variant="label" color={c.heroText} style={{ flex: 1 }}>
        {msg}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pad: { flexDirection: "row", flexWrap: "wrap" },
  key: { width: "33.33%", height: 64, alignItems: "center", justifyContent: "center", borderRadius: radius.lg },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, gap: space.md, maxHeight: "92%" },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: "center", marginBottom: space.sm },
  copyIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  qr: { padding: 16, backgroundColor: "#ffffff", borderRadius: radius.lg, alignSelf: "center" },
  copy: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: radius.md, borderWidth: 1 },
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: radius.md,
    padding: space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
});
