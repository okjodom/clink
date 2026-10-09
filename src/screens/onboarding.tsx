import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isMnemonicWord, isValidMnemonic, mnemonicWordSuggestions } from "../lib/keys";
import { BRAND } from "../brand";
import { profileTemplate } from "../protocol/events";
import { publish, sign } from "../services/nostr";
import * as wallet from "../services/wallet";
import { useSession } from "../store/session";
import { useWallet } from "../store/wallet";
import { Button, Chip, Field, Logo, Notice, Screen, Text, success } from "../ui/components";
import { toastError } from "../ui/extras";
import { space, useColors } from "../ui/theme";

export function WelcomeScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const createWallet = useSession((s) => s.createWallet);
  const [busy, setBusy] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: c.hero, paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.lg }}>
      <StatusBar style="light" />
      <View style={{ paddingHorizontal: space.xl, gap: space.xl, flex: 1, justifyContent: "center" }}>
        <Logo size={72} />
        <View style={{ gap: space.md }}>
          <Text variant="hero" color={c.heroText}>
            {BRAND.tagline}
          </Text>
          <Text variant="body" color={c.heroMuted}>
            {BRAND.pitch}
          </Text>
        </View>
      </View>
      <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
        <Button
          title="Get started"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await createWallet();
            } catch (e) {
              toastError(e);
              setBusy(false);
            }
          }}
        />
        <Pressable onPress={() => nav.navigate("Restore")} style={{ alignItems: "center", padding: space.md }}>
          <Text variant="label" color={c.heroMuted}>
            I already have a wallet
          </Text>
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Feather name="lock" size={12} color={c.heroMuted} />
          <Text variant="caption" color={c.heroMuted}>
            Only you can touch your money. No sign-up, no bank.
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * The one question a new wallet asks: what to call you. The answer becomes the
 * name people see in chat and the username people pay you at.
 */
export function PickNameScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { profile, setProfile, finishNaming, keys } = useSession();
  const [name, setName] = useState(profile.name);
  const [busy, setBusy] = useState(false);
  const username = wallet.usernameFrom(name);

  const done = async () => {
    const clean = name.trim();
    setBusy(true);
    if (clean) {
      const next = { ...profile, name: clean };
      setProfile(next);
      if (keys) void publish(sign(profileTemplate({ name: clean, about: next.about }), keys.identity.sk)).catch(() => undefined);
    }
    if (username.length >= 3) {
      // The wallet may still be connecting; don't hold the person here for long.
      const claim = wallet.claimFirstFree(username).then((a) => {
        useWallet.getState().setLightningAddress(a.address, a.lnurl);
        if (keys && clean) void publish(sign(profileTemplate({ name: clean, about: profile.about, lud16: a.address }), keys.identity.sk)).catch(() => undefined);
        return a;
      });
      claim.catch(() => undefined); // they can pick one later from Receive
      await Promise.race([claim.catch(() => undefined), new Promise((r) => setTimeout(r, 12000))]);
    }
    success();
    finishNaming();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.lg }}>
      <View style={{ paddingHorizontal: space.xl, gap: space.lg, flex: 1 }}>
        <Text variant="display">What should people call you?</Text>
        <Text muted>Friends pay you by this name, and agents see it when you add money or cash out.</Text>
        <Field value={name} onChangeText={setName} placeholder="Your name" autoFocus maxLength={48} returnKeyType="done" onSubmitEditing={done} />
        {username.length >= 3 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="at-sign" size={14} color={c.primary} />
            <Text variant="label" color={c.primary}>
              {username}
            </Text>
            <Text variant="caption" muted>
              will be your username
            </Text>
          </View>
        )}
      </View>
      <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
        <Button title="Continue" loading={busy} disabled={!name.trim()} onPress={done} />
        <Pressable onPress={finishNaming} disabled={busy} style={{ alignItems: "center", padding: space.md }}>
          <Text variant="label" muted>
            Skip for now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function RestoreScreen() {
  const restore = useSession((s) => s.restoreWallet);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const last = text.endsWith(" ") ? "" : (words[words.length - 1] ?? "");
  const suggestions = last && !isMnemonicWord(last) ? mnemonicWordSuggestions(last) : [];
  const bad = words.filter((w, i) => !isMnemonicWord(w) && (i < words.length - 1 || text.endsWith(" ")));
  const valid = (words.length === 12 || words.length === 24) && isValidMnemonic(text);

  return (
    <Screen
      back
      title="Restore"
      footer={
        <Button
          title="Restore wallet"
          disabled={!valid}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await restore(text);
            } catch (e) {
              toastError(e);
              setBusy(false);
            }
          }}
        />
      }
    >
      <Text variant="title">Enter your recovery phrase</Text>
      <Text muted>Type your 12 or 24 words in order, separated by spaces. Your money, your username and your swaps come back with it.</Text>
      <Field
        value={text}
        onChangeText={setText}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        placeholder="word1 word2 word3 …"
        error={bad.length ? `Not in the word list: ${bad.join(", ")}` : null}
        hint={`${words.length} word${words.length === 1 ? "" : "s"}`}
      />
      {suggestions.length > 0 && (
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          {suggestions.map((s) => (
            <Chip key={s} label={s} onPress={() => setText([...words.slice(0, -1), s].join(" ") + " ")} />
          ))}
        </View>
      )}
      <Notice tone="warning" title={`Only ever type this into ${BRAND.name}`}>
        {`Nobody from ${BRAND.name}, and no agent, will ever ask for these words.`}
      </Notice>
    </Screen>
  );
}
