import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import { radius, space, useColors } from "./theme";

/** Quiet activity refresh feedback. Reduced motion keeps a static highlight. */
export function ActivityShimmer({ width = 44, height = 6 }: { width?: number; height?: number }) {
  const c = useColors();
  const progress = useRef(new Animated.Value(0)).current;
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (alive) setReduced(value); });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { alive = false; sub.remove(); };
  }, []);
  useEffect(() => {
    if (reduced) { progress.setValue(0.5); return; }
    const animation = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    progress.setValue(0);
    animation.start();
    return () => animation.stop();
  }, [progress, reduced]);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Refreshing activity" style={{ width, height, borderRadius: radius.pill, backgroundColor: c.surfaceAlt, overflow: "hidden" }}>
      <Animated.View style={{ width: width / 2, height, backgroundColor: c.border, opacity: 0.65, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-width / 2, width] }) }] }} />
    </View>
  );
}

export function ActivitySkeleton() {
  const c = useColors();
  return (
    <View style={{ borderRadius: radius.lg, backgroundColor: c.surface, padding: space.lg, gap: space.xl }}>
      {[0, 1, 2].map((row) => (
        <View key={row} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: c.surfaceAlt }} />
          <View style={{ flex: 1, gap: space.sm }}>
            <ActivityShimmer width={120} height={12} />
            <ActivityShimmer width={80} height={8} />
          </View>
          <ActivityShimmer width={56} height={12} />
        </View>
      ))}
    </View>
  );
}
