import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import React, { useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isMnemonicWord, mnemonicWordSuggestions } from "../lib/keys";
import { editRecoveryWord, RECOVERY_WORD_COUNT, validRecoveryWords } from "../lib/recovery";
import { BRAND } from "../brand";
import { profileTemplate } from "../protocol/events";
import { publish, sign } from "../services/nostr";
import * as wallet from "../services/wallet";
import { useSession } from "../store/session";
import { useWallet } from "../store/wallet";
import { Button, Chip, Field, Logo, Screen, Text, Wordmark, success } from "../ui/components";
import { toast, toastError } from "../ui/extras";
import { space, useColors } from "../ui/theme";
import { RecoveryWords } from "../ui/recoveryWords";

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
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }} accessible accessibilityLabel={BRAND.name}>
          <Logo size={64} />
          <Wordmark height={40} color={c.heroText} />
        </View>
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
      // A restored wallet may already have its address: keep it rather than claim another.
      const claim = wallet.lightningAddressInfo().then((have) => have ?? wallet.claimFirstFree(username)).then((a) => {
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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.lg }}>
      <View style={{ paddingHorizontal: space.xl, gap: space.lg, flex: 1 }}>
        <Text variant="display">What should people call you?</Text>
        <Text muted>Friends pay you by this name, and agents see it when you add money or cash out.</Text>
        <Field value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="sentences" autoFocus maxLength={48} returnKeyType="done" onSubmitEditing={done} />
        {username.length >= 3 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="at-sign" size={14} color={c.primaryInk} />
            <Text variant="label" color={c.primaryInk}>
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
    </KeyboardAvoidingView>
  );
}

export function RestoreScreen() {
  const c = useColors();
  const restore = useSession((s) => s.restoreWallet);
  const [words, setWords] = useState<string[]>(Array(RECOVERY_WORD_COUNT).fill(""));
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const fields = useRef<Array<TextInput | null>>([]);
  const scroll = useRef<ScrollView>(null);
  const gridTop = useRef(0);
  const restoring = useRef(false);
  const entered = words.filter(Boolean).length;
  const invalid = words.flatMap((word, i) => word && !isMnemonicWord(word) && active !== i ? [i] : []);
  const suggestions = active === null ? [] : mnemonicWordSuggestions(words[active]);
  const valid = validRecoveryWords(words);
  const checksumProblem = entered === RECOVERY_WORD_COUNT && words.every(isMnemonicWord) && !valid;
  const problem = editError ?? (invalid.length ? `Check word ${invalid[0] + 1}.` : checksumProblem ? "These words don't match. Check each word and its order." : null);

  const focus = (index: number) => fields.current[index]?.focus();
  const edit = (index: number, value: string) => {
    const next = editRecoveryWord(words, index, value);
    setWords(next.words);
    setEditError(next.error);
    if (next.next !== null) requestAnimationFrame(() => focus(next.next!));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <Screen
      back
      title="Restore"
      scroll={false}
      padded={false}
      footer={
        <View style={{ gap: space.sm }}>
        {suggestions.length > 0 && <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {suggestions.map((word) => <Chip key={word} label={word} onPress={() => {
            if (active === null || busy) return;
            edit(active, word + " ");
          }} />)}
        </ScrollView>}
        <Button
          title="Restore wallet"
          disabled={!valid}
          loading={busy}
          onPress={async () => {
            if (!valid || restoring.current) return;
            restoring.current = true;
            Keyboard.dismiss();
            setBusy(true);
            try {
              await restore(words.join(" "));
              const name = useSession.getState().profile.name;
              toast(name ? `Welcome back, ${name}` : "Wallet restored", "success");
            } catch (e) {
              toastError(e);
              setBusy(false);
              restoring.current = false;
            }
          }}
        />
        </View>
      }
    >
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.lg }}>
        <Text variant="title">Your 12 recovery words</Text>
        <Text muted>Enter them in the order you wrote them down.</Text>
        <Text variant="caption" muted>{entered} of 12 words</Text>
        <RecoveryWords words={words} active={active} invalid={invalid} onPressWord={focus}
          onLayout={(event) => { gridTop.current = event.nativeEvent.layout.y; }}
          renderWord={(word, i) => <TextInput
            ref={(field) => { fields.current[i] = field; }}
            value={word} editable={!busy} autoFocus={i === 0}
            accessibilityLabel={`Recovery word ${i + 1}`}
            onChangeText={(value) => edit(i, value)}
            onFocus={() => {
              setActive(i);
              scroll.current?.scrollTo({ y: i < 3 ? 0 : Math.max(0, gridTop.current + Math.floor(i / 3) * (52 + space.sm) - space.sm), animated: true });
            }}
            onBlur={() => setActive((current) => current === i ? null : current)}
            onSubmitEditing={() => i < RECOVERY_WORD_COUNT - 1 ? focus(i + 1) : Keyboard.dismiss()}
            onKeyPress={({ nativeEvent }) => { if (nativeEvent.key === "Backspace" && !word && i > 0) focus(i - 1); }}
            autoCapitalize="none" autoCorrect={false} spellCheck={false} autoComplete="off"
            textContentType="none" importantForAutofill="no"
            returnKeyType={i === RECOVERY_WORD_COUNT - 1 ? "done" : "next"}
            blurOnSubmit={false}
            style={{ flex: 1, minWidth: 0, paddingVertical: 12, paddingHorizontal: 0, fontSize: 14, fontWeight: "500", color: c.text }}
          />} />
        {problem && <Text variant="caption" color={c.danger} accessibilityLiveRegion="polite">{problem}</Text>}
        <Text variant="caption" muted>Never share these words. They unlock your wallet.</Text>
      </ScrollView>
    </Screen>
    </KeyboardAvoidingView>
  );
}
