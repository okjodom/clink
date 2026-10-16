import React from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { Text } from "./components";
import { radius, space, useColors } from "./theme";

/** The same numbered, left-to-right word layout for backup and recovery. */
export function RecoveryWords({ words, renderWord, active, invalid = [], onPressWord, onLayout }: {
  words: string[];
  renderWord?: (word: string, index: number) => React.ReactNode;
  active?: number | null;
  invalid?: number[];
  onPressWord?: (index: number) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const c = useColors();
  return <View onLayout={onLayout} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
    {words.map((word, i) => {
      const style = {
        width: "31.5%" as const, minHeight: 52, flexDirection: "row" as const, gap: 6, alignItems: "center" as const,
        backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: 8,
        borderWidth: 1, borderColor: active === i ? c.primaryInk : invalid.includes(i) ? c.danger : c.border,
      };
      const content = <>
        <Text variant="caption" faint style={{ width: 18 }}>{i + 1}</Text>
        {renderWord ? renderWord(word, i) : <Text variant="label" style={{ fontSize: 14, flexShrink: 1 }}>{word}</Text>}
      </>;
      return onPressWord
        ? <Pressable key={i} accessible={false} onPress={() => onPressWord(i)} style={style}>{content}</Pressable>
        : <View key={i} style={style}>{content}</View>;
    })}
  </View>;
}
