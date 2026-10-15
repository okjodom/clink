const { version } = require("./package.json");

const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV || "development";
const IS_PRODUCTION = APP_ENV === "production";

// The pontmore:// scheme is the protocol's, shared on purpose: agent links open in any Pontmore client.
const NATIVE = IS_PRODUCTION
  ? { name: "Clink", scheme: "pontmore", id: "com.clink.me" }
  : { name: "Clink Dev", scheme: "pontmore", id: "com.dev.clink.me" };

/** Brand colours, kept in step with src/ui/theme.ts and scripts/brand-assets.mjs. */
const CREAM = "#fbf6ec";
const INK = "#14110f";
const GOLD = "#ffb020";

/** 1.2.3 -> 1002003, so every release installs over the previous one. */
function versionCode(semver) {
  const [major, minor, patch] = semver.split("-")[0].split(".").map(Number);
  return major * 1_000_000 + minor * 1_000 + patch;
}

const CAMERA_COPY = "Clink uses the camera to scan payment and agent QR codes. No photos are stored.";
const FACE_ID_COPY = "Clink uses Face ID to protect your recovery phrase.";

export default {
  expo: {
    name: NATIVE.name,
    slug: "clink",
    scheme: NATIVE.scheme,
    version,
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    backgroundColor: CREAM,
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: CREAM,
      dark: { image: "./assets/splash-dark.png", backgroundColor: INK },
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: false,
      bundleIdentifier: NATIVE.id,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription: CAMERA_COPY,
        NSFaceIDUsageDescription: FACE_ID_COPY,
      },
    },
    android: {
      package: NATIVE.id,
      versionCode: versionCode(version),
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        monochromeImage: "./assets/monochrome-icon.png",
        backgroundColor: GOLD,
      },
      permissions: ["CAMERA", "USE_BIOMETRIC"],
      intentFilters: [
        {
          action: "VIEW",
          category: ["BROWSABLE", "DEFAULT"],
          data: [{ scheme: NATIVE.scheme }],
        },
      ],
    },
    plugins: [
      "@breeztech/breez-sdk-spark-react-native",
      ["expo-camera", { cameraPermission: CAMERA_COPY }],
      "expo-secure-store",
      "./plugins/withReleaseSigning",
      ["expo-local-authentication", { faceIDPermission: FACE_ID_COPY }],
      // expo-audio (the clink sound) is left out of plugins on purpose: its plugin
      // adds microphone and background-audio permissions, and playback needs neither.
    ],
    extra: {
      appEnv: APP_ENV,
      breezApiKey: process.env.EXPO_PUBLIC_BREEZ_API_KEY,
      breezNetwork: process.env.EXPO_PUBLIC_BREEZ_NETWORK || "mainnet",
      defaultRelays: process.env.EXPO_PUBLIC_DEFAULT_RELAYS,
    },
  },
};
