import { useColorScheme } from "react-native";

/**
 * Brand: Clink. Coin gold on warm cream, deep ink for the money card.
 *
 * `primary` is the gold fill (buttons, switches, the Clink moment) and always
 * carries `primaryText` on top. Gold is too light to read as text, so text and
 * icons in the brand colour use `primaryInk`. Money in is `positive` (green),
 * money out is `accent` (coral); always pair them with a sign or arrow, since
 * red means "up" in much of East Asia.
 */
const light = {
  bg: "#fbf6ec",
  surface: "#ffffff",
  surfaceAlt: "#f3ecdd",
  border: "#e7decc",
  text: "#14110f",
  textMuted: "#5e564c",
  textFaint: "#958c80",
  primary: "#ffb020",
  primaryText: "#14110f",
  primarySoft: "#fff0cc",
  primaryInk: "#8f5500",
  positive: "#177a4a",
  positiveText: "#ffffff",
  positiveSoft: "#e2f3e9",
  accent: "#b83c27",
  accentText: "#ffffff",
  accentSoft: "#fde6e0",
  danger: "#c93636",
  dangerSoft: "#fbe4e4",
  warning: "#985800",
  warningSoft: "#fff1d9",
  info: "#2b6cb0",
  infoSoft: "#e3eefa",
  overlay: "rgba(20,17,15,0.45)",
  hero: "#14110f",
  heroText: "#fbf6ec",
  heroMuted: "#b9afa2",
};

const dark: typeof light = {
  bg: "#14110f",
  surface: "#1e1a16",
  surfaceAlt: "#28221c",
  border: "#362e26",
  text: "#fbf6ec",
  textMuted: "#b9afa2",
  textFaint: "#847a6e",
  primary: "#ffb020",
  primaryText: "#14110f",
  primarySoft: "#3a2c10",
  primaryInk: "#ffc24d",
  positive: "#3cc27e",
  positiveText: "#14110f",
  positiveSoft: "#15301f",
  accent: "#ff7a61",
  accentText: "#14110f",
  accentSoft: "#3d1e17",
  danger: "#f27474",
  dangerSoft: "#3b1d1d",
  warning: "#ffc24d",
  warningSoft: "#3a2c10",
  info: "#9bd2ff",
  infoSoft: "#17283a",
  overlay: "rgba(0,0,0,0.6)",
  hero: "#221c17",
  heroText: "#fbf6ec",
  heroMuted: "#a99f92",
};

export type Colors = typeof light;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const type = {
  hero: { fontSize: 44, fontWeight: "800" as const, letterSpacing: -1, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  display: { fontSize: 32, fontWeight: "800" as const, letterSpacing: -0.6, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  title: { fontSize: 24, fontWeight: "700" as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: "600" as const },
  body: { fontSize: 16, fontWeight: "400" as const, lineHeight: 22 },
  label: { fontSize: 14, fontWeight: "600" as const },
  caption: { fontSize: 13, fontWeight: "400" as const, lineHeight: 18 },
  tiny: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.6 },
};

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

export function useIsDark(): boolean {
  return useColorScheme() === "dark";
}

export { light as lightColors, dark as darkColors };
