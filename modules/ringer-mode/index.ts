import { requireOptionalNativeModule } from "expo";

const native = requireOptionalNativeModule<{ isSilent(): boolean }>("RingerMode");

/**
 * Android: true when the ringer is on silent or vibrate. iOS has no API for
 * the mute switch; there the audio session respects it instead, so this is
 * always false. Also false on builds made before this module existed.
 */
export function isSilent(): boolean {
  try {
    return native?.isSilent() ?? false;
  } catch {
    return false;
  }
}
