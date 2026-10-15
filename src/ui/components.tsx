import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AccessibilityInfo,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import { radius, space, type, useColors, type Colors } from "./theme";

export type IconName = React.ComponentProps<typeof Feather>["name"];

export const tap = () => void Haptics.selectionAsync().catch(() => undefined);
export const success = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);

// -- text ----------------------------------------------------------------------

type Variant = keyof typeof type;

export function Text({
  variant = "body",
  color,
  muted,
  faint,
  center,
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: string; muted?: boolean; faint?: boolean; center?: boolean }) {
  const c = useColors();
  return (
    <RNText
      {...rest}
      style={[
        type[variant],
        { color: color ?? (faint ? c.textFaint : muted ? c.textMuted : c.text) },
        center && { textAlign: "center" },
        style,
      ]}
    />
  );
}

// -- layout --------------------------------------------------------------------

export function Screen({
  children,
  title,
  back,
  onBack,
  right,
  scroll = true,
  padded = true,
  footer,
  large,
  style,
  onRefresh,
  refreshing,
}: {
  children: React.ReactNode;
  title?: string;
  back?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  footer?: React.ReactNode;
  large?: boolean;
  style?: StyleProp<ViewStyle>;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const body = (
    <View style={[padded && { paddingHorizontal: space.lg }, { gap: space.lg, paddingBottom: scroll ? space.xl : space.sm }, !scroll && { flex: 1 }, style]}>
      {large && title ? (
        // A large title carries its own action beside it, so there's no bar above.
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, marginTop: space.sm }}>
          <Text variant="display" style={{ flexShrink: 1 }}>
            {title}
          </Text>
          {!back && right}
        </View>
      ) : null}
      {children}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      {(back || (title && !large) || (right && !large)) && <Header title={large ? undefined : title} back={back} onBack={onBack} right={right} />}
      {!back && large && <View style={{ height: space.sm }} />}
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.primaryInk} /> : undefined}
        >
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{body}</View>
      )}
      {footer ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: Math.max(insets.bottom, space.lg), gap: space.sm }}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export function Header({ title, back, onBack, right }: { title?: string; back?: boolean; onBack?: () => void; right?: React.ReactNode }) {
  const nav = useNavigation();
  const c = useColors();
  return (
    <View style={styles.header}>
      <View style={{ width: 44 }}>
        {back && (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={onBack ?? (() => nav.goBack())} style={({ pressed }) => [styles.iconBtn, { backgroundColor: c.surface, opacity: pressed ? 0.65 : 1 }]}>
            <Feather name="chevron-left" size={22} color={c.text} />
          </Pressable>
        )}
      </View>
      <Text variant="heading" numberOfLines={1} style={{ flex: 1, textAlign: "center" }}>
        {title ?? ""}
      </Text>
      <View style={{ minWidth: 44, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

export function IconButton({ name, onPress, label }: { name: IconName; onPress: () => void; label?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.iconBtn, { backgroundColor: c.surface, opacity: pressed ? 0.65 : 1 }]}
    >
      <Feather name={name} size={19} color={c.text} />
    </Pressable>
  );
}

export function Card({ children, style, onPress, tone }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; tone?: "default" | "alt" | "primary" | "positive" | "accent" | "danger" | "warning" }) {
  const c = useColors();
  const bg =
    tone === "alt" ? c.surfaceAlt : tone === "primary" ? c.primarySoft : tone === "positive" ? c.positiveSoft : tone === "accent" ? c.accentSoft : tone === "danger" ? c.dangerSoft : tone === "warning" ? c.warningSoft : c.surface;
  if (!onPress) return <View style={[styles.card, { backgroundColor: bg }, style]}>{children}</View>;
  // The Pressable is what sits in the parent's layout, so flex sizing belongs on it.
  const { flex, flexBasis, flexGrow, flexShrink, minWidth, maxWidth, width, alignSelf, ...rest } = StyleSheet.flatten(style) ?? {};
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({ flex, flexBasis, flexGrow, flexShrink, minWidth, maxWidth, width, alignSelf, opacity: pressed ? 0.65 : 1 })}
    >
      <View style={[styles.card, { backgroundColor: bg }, rest, flex !== undefined && { flex: 1 }]}>{children}</View>
    </Pressable>
  );
}

export function Row({
  icon,
  iconColor,
  iconBg,
  left,
  title,
  subtitle,
  right,
  chevron,
  onPress,
  danger,
}: {
  icon?: IconName;
  iconColor?: string;
  iconBg?: string;
  left?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  danger?: boolean;
}) {
  const c = useColors();
  const content = (
    <View style={styles.row}>
      {left ??
        (icon ? (
          <View style={[styles.rowIcon, { backgroundColor: iconBg ?? c.surfaceAlt }]}>
            <Feather name={icon} size={18} color={iconColor ?? (danger ? c.danger : c.text)} />
          </View>
        ) : null)}
      <View style={{ flex: 1, gap: 2 }}>
        {typeof title === "string" ? (
          <Text variant="label" color={danger ? c.danger : undefined} numberOfLines={2}>
            {title}
          </Text>
        ) : (
          title
        )}
        {typeof subtitle === "string" ? (
          <Text variant="caption" muted numberOfLines={2}>
            {subtitle}
          </Text>
        ) : (
          subtitle
        )}
      </View>
      {right}
      {chevron && <Feather name="chevron-right" size={18} color={c.textFaint} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
      onPress={() => {
        tap();
        onPress();
      }}
    >
      {content}
    </Pressable>
  );
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginVertical: 2 }} />;
}

export function Section({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      {(title || action) && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2 }}>
          {title ? (
            <Text variant="tiny" muted style={{ textTransform: "uppercase" }}>
              {title}
            </Text>
          ) : (
            <View />
          )}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

/** A section whose body opens on tap; secondary detail stays out of the way until wanted. */
export function Collapsible({ title, summary, children, initiallyOpen = false }: { title: string; summary?: string; children: React.ReactNode; initiallyOpen?: boolean }) {
  const c = useColors();
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={{ gap: space.sm }}>
      <Pressable
        onPress={() => {
          tap();
          setOpen(!open);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 2, paddingVertical: 4, opacity: pressed ? 0.65 : 1 })}
      >
        <Text variant="tiny" muted style={{ textTransform: "uppercase" }}>
          {title}
        </Text>
        {!open && summary ? (
          <Text variant="caption" faint numberOfLines={1} style={{ flex: 1 }}>
            {summary}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Feather name={open ? "chevron-up" : "chevron-down"} size={16} color={c.textMuted} />
      </Pressable>
      {open && children}
    </View>
  );
}

// -- buttons -------------------------------------------------------------------

type ButtonKind = "primary" | "secondary" | "ghost" | "danger" | "accent" | "positive";

export function Button({
  title,
  onPress,
  kind = "primary",
  icon,
  loading,
  disabled,
  small,
  style,
}: {
  title: string;
  onPress: () => void | Promise<void>;
  kind?: ButtonKind;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const palette: Record<ButtonKind, { bg: string; fg: string; border?: string }> = {
    primary: { bg: c.primary, fg: c.primaryText },
    positive: { bg: c.positive, fg: c.positiveText },
    accent: { bg: c.accent, fg: c.accentText },
    secondary: { bg: c.surface, fg: c.text, border: c.border },
    ghost: { bg: "transparent", fg: c.primaryInk },
    danger: { bg: c.dangerSoft, fg: c.danger },
  };
  const p = palette[kind];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      onPress={() => {
        tap();
        void onPress();
      }}
      style={({ pressed }) => [styles.button, small && styles.buttonSmall, { backgroundColor: p.bg, borderColor: p.border ?? "transparent" }, style, { opacity: disabled ? 0.45 : pressed ? 0.65 : 1 }]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <>
          {icon && <Feather name={icon} size={small ? 16 : 19} color={p.fg} />}
          <Text variant="heading" color={p.fg} style={small ? { fontSize: 15 } : undefined}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function ActionTile({ icon, label, onPress, tone = "default" }: { icon: IconName; label: string; onPress: () => void; tone?: "default" | "hero" }) {
  const c = useColors();
  const hero = tone === "hero";
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({ alignItems: "center", gap: 6, flex: 1, opacity: pressed ? 0.65 : 1 })}
    >
      <View style={[styles.tile, { backgroundColor: hero ? "rgba(247,243,234,0.12)" : c.surface }]}>
        <Feather name={icon} size={22} color={hero ? c.heroText : c.text} />
      </View>
      <Text variant="caption" color={hero ? c.heroText : c.text} style={{ fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

// -- inputs --------------------------------------------------------------------

export function Field({ label, hint, error, style, ...props }: TextInputProps & { label?: string; hint?: string; error?: string | null }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label && <Text variant="label">{label}</Text>}
      <TextInput
        placeholderTextColor={c.textFaint}
        {...props}
        style={[
          styles.input,
          { backgroundColor: c.surface, color: c.text, borderColor: error ? c.danger : c.border },
          props.multiline && { minHeight: 96, textAlignVertical: "top", paddingTop: 14 },
          style as StyleProp<TextStyle>,
        ]}
      />
      {error ? (
        <Text variant="caption" color={c.danger}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" faint>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Toggle({ value, onChange, label, subtitle, icon }: { value: boolean; onChange: (v: boolean) => void; label: string; subtitle?: string; icon?: IconName }) {
  const c = useColors();
  return (
    <Row
      icon={icon}
      title={label}
      subtitle={subtitle}
      right={
        <Switch
          accessibilityLabel={label}
          value={value}
          onValueChange={(v) => {
            tap();
            onChange(v);
          }}
          trackColor={{ true: c.primary, false: c.border }}
          thumbColor="#ffffff"
        />
      }
    />
  );
}

/** `emoji` renders in its own text run; some Android fonts drop text that shares a run with a flag. */
export function Chip({ label, selected, onPress, icon, emoji }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; emoji?: string }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? c.text : c.surface, borderColor: selected ? c.text : c.border, opacity: pressed ? 0.65 : 1 },
      ]}
    >
      {icon && <Feather name={icon} size={14} color={selected ? c.bg : c.text} />}
      {emoji && <Text variant="label">{emoji}</Text>}
      <Text variant="label" color={selected ? c.bg : c.text}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string; caption?: string }[]; value: T; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View style={[styles.segment, { backgroundColor: c.surfaceAlt }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={({ pressed }) => [styles.segmentItem, on && { backgroundColor: c.surface, shadowOpacity: 0.08 }, { opacity: pressed ? 0.65 : 1 }]}
          >
            <Text variant="label" color={on ? c.text : c.textMuted}>
              {o.label}
            </Text>
            {o.caption && <Text variant="caption" color={on ? c.text : c.textMuted} center>{o.caption}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

// -- status ----------------------------------------------------------------------

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export function toneColors(c: Colors, tone: Tone) {
  switch (tone) {
    case "success":
      return { bg: c.positiveSoft, fg: c.positive };
    case "warning":
      return { bg: c.warningSoft, fg: c.warning };
    case "danger":
      return { bg: c.dangerSoft, fg: c.danger };
    case "info":
      return { bg: c.infoSoft, fg: c.info };
    case "accent":
      return { bg: c.accentSoft, fg: c.accent };
    default:
      return { bg: c.surfaceAlt, fg: c.textMuted };
  }
}

export function Badge({ label, tone = "neutral", icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const c = useColors();
  const t = toneColors(c, tone);
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {icon && <Feather name={icon} size={12} color={t.fg} />}
      <Text variant="tiny" color={t.fg}>
        {label}
      </Text>
    </View>
  );
}

export function Notice({ tone = "info", icon, title, children, action }: { tone?: Tone; icon?: IconName; title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const c = useColors();
  const t = toneColors(c, tone);
  return (
    <View style={[styles.notice, { backgroundColor: t.bg }]}>
      <Feather name={icon ?? (tone === "danger" ? "alert-octagon" : tone === "warning" ? "alert-triangle" : "info")} size={18} color={t.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 4 }}>
        {title && (
          <Text variant="label" color={c.text}>
            {title}
          </Text>
        )}
        {typeof children === "string" ? (
          <Text variant="caption" muted>
            {children}
          </Text>
        ) : (
          children
        )}
        {action}
      </View>
    </View>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center", paddingVertical: space.xxl, gap: space.md }}>
      <View style={[styles.emptyIcon, { backgroundColor: c.surfaceAlt }]}>
        <Feather name={icon} size={26} color={c.textMuted} />
      </View>
      <Text variant="heading" center>
        {title}
      </Text>
      {body && (
        <Text variant="caption" muted center style={{ maxWidth: 280 }}>
          {body}
        </Text>
      )}
      {action}
    </View>
  );
}

export function Spinner({ label }: { label?: string }) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center", gap: space.md, paddingVertical: space.xl }}>
      <ActivityIndicator color={c.primaryInk} />
      {label && (
        <Text variant="caption" muted>
          {label}
        </Text>
      )}
    </View>
  );
}

export function Pulse({ color, size = 10 }: { color: string; size?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // An endless loop is noise for people who turned animations off.
    let loop: Animated.CompositeAnimation | null = null;
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive || reduce) return;
      loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, useNativeDriver: true }));
      loop.start();
    });
    return () => {
      alive = false;
      loop?.stop();
    };
  }, [v]);
  return (
    <View style={{ width: size * 2.4, height: size * 2.4, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={{
          position: "absolute",
          width: size * 2.4,
          height: size * 2.4,
          borderRadius: size * 2,
          backgroundColor: color,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

// -- brand & identity ----------------------------------------------------------------

const GOLD = "#ffb020";
const CREAM = "#fbf6ec";
const INK = "#14110f";

/**
 * Two coins meeting, with a spark where they touch. Same shapes as
 * scripts/brand-assets.mjs, which draws the app icon and splash.
 */
function Mark() {
  return (
    <G>
      {[
        [318, 590],
        [706, 434],
      ].map(([cx, cy]) => (
        <G key={cx}>
          <Circle cx={cx} cy={cy} r={209} fill={INK} />
          <Circle cx={cx} cy={cy} r={150} fill="none" stroke={GOLD} strokeWidth={22} />
        </G>
      ))}
      <Path d="M512 382 Q526 498 642 512 Q526 526 512 642 Q498 526 382 512 Q498 498 512 382 Z" fill={GOLD} stroke={GOLD} strokeWidth={52} strokeLinejoin="round" />
      <Path d="M512 382 Q526 498 642 512 Q526 526 512 642 Q498 526 382 512 Q498 498 512 382 Z" fill={CREAM} />
    </G>
  );
}

/** The app tile: reads on any background, light or dark. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="Clink">
      <Rect width={1024} height={1024} rx={230} fill={GOLD} />
      <G transform="translate(512 512) scale(0.86) translate(-512 -512)">
        <Mark />
      </G>
    </Svg>
  );
}

/** Lowercase "clink"; the dot on the i is a gold coin. */
/** Pass `dot` when drawing on gold, where the gold dot would vanish. */
export function Wordmark({ height = 32, color = INK, dot = GOLD }: { height?: number; color?: string; dot?: string }) {
  return (
    <Svg width={(height * 540) / 220} height={height} viewBox="0 0 540 220" accessibilityLabel="Clink">
      <G transform="translate(14 0)" fill="none" stroke={color} strokeWidth={30} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M100 116 A50 50 0 1 0 100 184" />
        <Path d="M158 30 V200" />
        <Path d="M218 106 V200" />
        <Path d="M278 200 V106 M278 150 A50 50 0 0 1 378 150 V200" />
        <Path d="M438 30 V200 M500 106 L440 160 M462 142 L506 200" />
      </G>
      <Circle cx={232} cy={48} r={21} fill={dot} />
    </Svg>
  );
}

/** The spark on its own, for the Clink moment. */
export function Spark({ size = 48, color = CREAM }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="382 382 260 260">
      <Path d="M512 382 Q526 498 642 512 Q526 526 512 642 Q498 526 382 512 Q498 498 512 382 Z" fill={color} />
    </Svg>
  );
}

const AVATAR_COLORS = ["#177a4a", "#b86e00", "#2b6cb0", "#8e5bd0", "#b83c27", "#0f8a8a", "#8f5500", "#3d5a80"];

export function Avatar({ pk, name, size = 44 }: { pk: string; name?: string; size?: number }) {
  const seed = /^[0-9a-f]{6}/i.test(pk) ? parseInt(pk.slice(0, 6), 16) : [...pk].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const color = AVATAR_COLORS[seed % AVATAR_COLORS.length];
  const initials = (name || pk.slice(0, 2))
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text variant="label" color="#ffffff" style={{ fontSize: size * 0.36 }}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, height: 52, gap: space.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm, minHeight: 48 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  button: {
    height: 56,
    borderRadius: radius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingHorizontal: space.xl,
    borderWidth: 1,
  },
  buttonSmall: { height: 42, borderRadius: radius.md, paddingHorizontal: space.lg },
  tile: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  input: { height: 54, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.lg, fontSize: 16 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 38, borderRadius: radius.pill, borderWidth: 1 },
  segment: { flexDirection: "row", borderRadius: radius.md, padding: 4 },
  segmentItem: { flex: 1, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, shadowOpacity: 0 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" },
  notice: { flexDirection: "row", gap: space.md, padding: space.lg, borderRadius: radius.md },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
});
