import { Feather } from "@expo/vector-icons";
import { createBottomTabNavigator, type BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { DarkTheme, DefaultTheme, NavigationContainer, useIsFocused, useNavigation, type LinkingOptions } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import React, { useEffect, useRef } from "react";
import { Platform, Pressable, type StyleProp, type ViewStyle } from "react-native";

import { useActiveSwaps, useMe } from "../hooks";
import { describeSwap } from "../lib/swapView";
import { useSession } from "../store/session";
import { tap, toneColors } from "../ui/components";
import { useColors, useIsDark } from "../ui/theme";
import { AgentSetupScreen, DeskScreen } from "../screens/agent";
import { BackupScreen } from "../screens/backup";
import { AgentProfileScreen, DiscoverScreen } from "../screens/discover";
import { HomeScreen, TransactionsScreen } from "../screens/home";
import { ActivityScreen, AdvancedScreen, IdentityScreen, MeScreen, RelaysScreen, SignOutScreen } from "../screens/me";
import { PickNameScreen, RestoreScreen, WelcomeScreen } from "../screens/onboarding";
import { ReceiveScreen } from "../screens/receive";
import { ScanScreen, SendScreen } from "../screens/send";
import { ReceiveStablecoinScreen } from "../screens/stablecoin";
import { ChatScreen, SwapDetailScreen } from "../screens/swapDetail";
import { NewSwapScreen, ReviewSwapScreen } from "../screens/swapNew";
import { ContactsScreen } from "../screens/contacts";
import { TransactionDetailScreen } from "../screens/transactionDetail";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function useActionBadge() {
  const me = useMe();
  const active = useActiveSwaps();
  const pending = active.map((i) => describeSwap(i.rec, i.st, me)).filter((view) => view.myTurn);
  return { count: pending.length, tone: pending.find((view) => view.tone === "danger")?.tone ?? pending.find((view) => view.tone === "warning")?.tone ?? pending[0]?.tone ?? "neutral" };
}

/** Immediate pressed feedback, followed by a tab switch on release. */
function TabButton({ children, style, onPress, onLongPress, accessibilityState, accessibilityLabel, testID }: BottomTabBarButtonProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={(e) => {
        if (!accessibilityState?.selected) tap();
        onPress?.(e);
      }}
      onLongPress={onLongPress}
      style={({ pressed }) => [style as StyleProp<ViewStyle>, { opacity: pressed ? 0.65 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

function Tabs() {
  const c = useColors();
  const mode = useSession((s) => s.mode);
  const nav = useNavigation<any>();
  const focused = useIsFocused();
  const previousMode = useRef(mode);
  useEffect(() => {
    if (!focused || previousMode.current === mode) return;
    previousMode.current = mode;
    // Me exists in both modes, so React Navigation otherwise preserves it.
    // Wait for Main to regain focus if mode changed inside agent setup.
    nav.navigate("Main", { screen: mode === "agent" ? "Desk" : "Home" });
  }, [mode, focused, nav]);
  const pending = useActionBadge();
  const badgeColors = toneColors(c, pending.tone);
  const icon =
    (name: React.ComponentProps<typeof Feather>["name"]) =>
    ({ color }: { color: string }) => <Feather name={name} size={22} color={color} />;
  const badge = pending.count ? { tabBarBadge: pending.count, tabBarBadgeStyle: { backgroundColor: badgeColors.bg, color: badgeColors.fg, fontSize: 11 } } : {};

  return (
    <Tab.Navigator
      key={mode}
      initialRouteName={mode === "agent" ? "Desk" : "Home"}
      screenOptions={{
        headerShown: false,
        tabBarButton: TabButton,
        tabBarActiveTintColor: c.text,
        tabBarInactiveTintColor: c.textFaint,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.border, height: 88, paddingTop: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      {mode === "agent" ? (
        <>
          <Tab.Screen name="Desk" component={DeskScreen} options={{ tabBarIcon: icon("briefcase"), ...badge }} />
          <Tab.Screen name="Wallet" component={HomeScreen} options={{ tabBarIcon: icon("credit-card") }} />
          <Tab.Screen name="Me" component={MeScreen} options={{ title: "Profile", tabBarIcon: icon("user") }} />
        </>
      ) : (
        <>
          <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: "Wallet", tabBarIcon: icon("credit-card"), ...badge }} />
          <Tab.Screen name="Me" component={MeScreen} options={{ title: "Profile", tabBarIcon: icon("user") }} />
        </>
      )}
    </Tab.Navigator>
  );
}

const linking: LinkingOptions<ReactNavigation.RootParamList> = {
  prefixes: [Linking.createURL("/"), "pontmore://"],
  config: {
    screens: {
      AgentProfile: "agent/:pk",
      SwapDetail: "swap/:id",
    },
  },
};

export function RootNavigator() {
  const phase = useSession((s) => s.phase);
  const needsName = useSession((s) => s.needsName);
  const c = useColors();
  const dark = useIsDark();
  const base = dark ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: c.bg, card: c.bg, text: c.text, border: c.border, primary: c.primaryInk } };

  return (
    <NavigationContainer theme={theme} linking={phase === "ready" && !needsName ? linking : undefined}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, ...(Platform.OS === "android" ? { animation: "fade" as const } : {}) }}>
        {phase !== "ready" ? (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Restore" component={RestoreScreen} />
          </>
        ) : needsName ? (
          <Stack.Screen name="PickName" component={PickNameScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={Tabs} />
            <Stack.Screen name="Receive" component={ReceiveScreen} />
            <Stack.Screen name="ReceiveStablecoin" component={ReceiveStablecoinScreen} />
            <Stack.Screen name="Send" component={SendScreen} />
            <Stack.Screen name="Contacts" component={ContactsScreen} />
            <Stack.Screen name="Scan" component={ScanScreen} options={{ presentation: "fullScreenModal", animation: "fade" }} />
            <Stack.Screen name="Transactions" component={TransactionsScreen} />
            <Stack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
            <Stack.Screen name="Swaps" component={ActivityScreen} />
            <Stack.Screen name="Backup" component={BackupScreen} />
            <Stack.Screen name="NewSwap" component={NewSwapScreen} />
            <Stack.Screen name="ReviewSwap" component={ReviewSwapScreen} />
            <Stack.Screen name="SwapDetail" component={SwapDetailScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="Agents" component={DiscoverScreen} />
            <Stack.Screen name="AgentProfile" component={AgentProfileScreen} />
            <Stack.Screen name="AgentSetup" component={AgentSetupScreen} />
            <Stack.Screen name="Advanced" component={AdvancedScreen} />
            <Stack.Screen name="Identity" component={IdentityScreen} />
            <Stack.Screen name="Relays" component={RelaysScreen} />
            <Stack.Screen name="SignOut" component={SignOutScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
