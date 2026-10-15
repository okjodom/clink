package expo.modules.ringermode

import android.content.Context
import android.media.AudioManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Whether the phone is on silent or vibrate, so app sounds can stay quiet. */
class RingerModeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RingerMode")

    Function("isSilent") {
      val audio = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      audio != null && audio.ringerMode != AudioManager.RINGER_MODE_NORMAL
    }
  }
}
