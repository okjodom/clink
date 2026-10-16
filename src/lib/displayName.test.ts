import { sentenceCaseName } from "./displayName";
import { profileTemplate } from "../protocol/events";

it.each([
  ["clinker", "Clinker"], ["CLINKER", "Clinker"], ["cLiNkEr", "Clinker"],
  ["  JANE WANJIRU  ", "Jane wanjiru"], ["éLODIE", "Élodie"],
  ["🪙 CLINKER", "🪙 Clinker"], ["", ""], ["   ", ""],
])("normalizes display name %j to %j", (input, expected) => {
  expect(sentenceCaseName(input)).toBe(expected);
  expect(sentenceCaseName(expected)).toBe(expected);
});

it("publishes sentence case without changing the payment address or bio", () => {
  const meta = { name: "cLiNkEr", about: "KES and USD", lud16: "clinker@breez.tips" };
  expect(JSON.parse(profileTemplate(meta).content)).toEqual({ ...meta, name: "Clinker" });
  expect(meta.name).toBe("cLiNkEr");
});
