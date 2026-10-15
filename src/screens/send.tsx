import { Feather } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useEffect, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BRAND } from "../brand";
import { parseAgentLink } from "../lib/links";
import { Button, Notice, Screen, Text, success } from "../ui/components";
import { space } from "../ui/theme";

export { SendScreen } from "./sendComposer";

export function ScanScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const [permission, request] = useCameraPermissions();
  const handled = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void request();
  }, [permission, request]);

  const onCode = (data: string) => {
    if (handled.current) return;
    handled.current = true;
    success();
    const agent = parseAgentLink(data);
    if (agent) nav.replace("AgentProfile", { pk: agent });
    else if (route.params?.returnToSend) nav.popTo("Send", { input: data, scanId: Date.now() });
    else nav.replace("Send", { input: data });
  };

  if (!permission?.granted) {
    return (
      <Screen back title="Scan">
        <Notice tone="info" title="Camera access needed" action={<Button small title="Allow camera" onPress={() => void request()} />}>
          {`${BRAND.name} uses the camera only to read QR codes.`}
        </Notice>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => onCode(data)}
      />
      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]} pointerEvents="none">
        <View style={{ width: 250, height: 250, borderRadius: 28, borderWidth: 3, borderColor: "rgba(255,255,255,0.9)" }} />
        <Text variant="label" color="#ffffff" style={{ marginTop: space.xl }}>
          Point at a payment code
        </Text>
      </View>
      <Pressable
        onPress={() => nav.goBack()}
        style={{ position: "absolute", top: insets.top + 12, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}
      >
        <Feather name="x" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}
