jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation(() => ({ uri: "file:///cache/receipt.png", create: jest.fn(), write: jest.fn() })),
  Paths: { cache: "file:///cache" },
}));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));

import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type Svg from "react-native-svg";
import { captureImage, shareImage } from "./shareImage";

describe("image export", () => {
  afterEach(() => { jest.useRealTimers(); jest.clearAllMocks(); });

  it("exports the rendered preview as an image attachment, with no message or link", async () => {
    const svg = { toDataURL: jest.fn((callback: (data: string) => void) => callback("png-data")) } as unknown as Svg;
    await shareImage(svg, "receipt", 1080, 1200);
    expect(svg.toDataURL).toHaveBeenCalledWith(expect.any(Function), { width: 1080, height: 1200 });
    expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/receipt.png", { mimeType: "image/png", UTI: "public.png", dialogTitle: "Share image" });
    const file = jest.mocked(File).mock.results[0].value;
    expect(file.write).toHaveBeenCalledWith("png-data", { encoding: "base64" });
  });

  it("releases a stuck export instead of leaving the save/share button busy forever", async () => {
    jest.useFakeTimers();
    const svg = { toDataURL: jest.fn() } as unknown as Svg;
    const result = captureImage(svg);
    const expectation = expect(result).rejects.toThrow("Couldn't create the image");
    jest.advanceTimersByTime(8000);
    await expectation;
  });

  it("does not open the share sheet when image capture fails", async () => {
    const svg = { toDataURL: jest.fn((callback: (data: string) => void) => callback("")) } as unknown as Svg;
    await expect(shareImage(svg, "receipt")).rejects.toThrow("Couldn't create the image");
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});
