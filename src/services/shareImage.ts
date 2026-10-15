import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type Svg from "react-native-svg";

export function captureImage(svg: Svg, width = 1080, height = 1080): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Couldn't create the image. Try again.")), 8000);
    try {
      svg.toDataURL((data) => {
        clearTimeout(timer);
        if (data) resolve(data);
        else reject(new Error("Couldn't create the image. Try again."));
      }, { width, height });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

export async function shareImage(svg: Svg, name: string, width = 1080, height = 1080): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error("Image sharing isn't available on this device.");
  const data = await captureImage(svg, width, height);
  const file = new File(Paths.cache, `clink-${name.replace(/[^a-z0-9_-]/gi, "_")}-${Date.now()}.png`);
  file.create();
  file.write(data, { encoding: "base64" });
  await Sharing.shareAsync(file.uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: "Share image" });
}
