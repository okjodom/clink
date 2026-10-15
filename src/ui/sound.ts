/**
 * The Clink sound: two quick glassy strikes, played only when money lands
 * (assets/sounds/clink.wav, made by scripts/clink-sound.py). It mixes with
 * whatever else is playing and stays quiet when the phone is on silent or
 * vibrate: on iOS the audio session follows the mute switch, on Android
 * (where media plays regardless of the ringer) we ask the ringer first.
 *
 * expo-audio is loaded lazily so a dev client built before it was added
 * still runs, just without the sound.
 */
import type { AudioPlayer } from "expo-audio";

import { isSilent } from "../../modules/ringer-mode";

let player: AudioPlayer | null | undefined;

function load(): AudioPlayer | null {
  if (player !== undefined) return player;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const audio: typeof import("expo-audio") = require("expo-audio");
    void audio.setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers" }).catch(() => undefined);
    player = audio.createAudioPlayer(require("../../assets/sounds/clink.wav"));
    player.volume = 0.7;
  } catch {
    player = null;
  }
  return player;
}

export function clink() {
  if (isSilent()) return;
  const p = load();
  if (!p) return;
  void p
    .seekTo(0)
    .then(() => p.play())
    .catch(() => undefined);
}
