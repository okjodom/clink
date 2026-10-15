import { paymentDescription, receiveDescription, refreshAddressBrand } from "./paymentBrand";

describe("payment branding", () => {
  it("rebrands the legacy default in old payment history without rewriting custom descriptions", () => {
    expect(paymentDescription("Pontspark wallet")).toBe("Paid on Clink");
    expect(paymentDescription(" pontspark ")).toBe("Paid on Clink");
    expect(paymentDescription("Pontspark wallet", "okjodom@breez.tips")).toBe("Paid okjodom on Clink");
    expect(paymentDescription("Clink wallet", "jane@pay.example")).toBe("Paid jane on Clink");
    expect(paymentDescription("Pontspark wallet - lunch")).toBe("Pontspark wallet - lunch");
    expect(paymentDescription("Lunch")).toBe("Lunch");
    expect(paymentDescription(undefined)).toBeUndefined();
  });

  it("updates the same username and returns the refreshed receive metadata", async () => {
    const old = { username: "jane", description: "Pontspark wallet", lightningAddress: "jane@pay.example" };
    const updated = { ...old, description: "Paid jane on Clink" };
    const update = jest.fn(async () => updated);
    await expect(refreshAddressBrand(old, update)).resolves.toBe(updated);
    expect(update).toHaveBeenCalledWith("jane", "Paid jane on Clink");
  });

  it("leaves current branding and custom receive descriptions alone", async () => {
    const update = jest.fn();
    for (const description of ["Paid jane on Clink", "Jane's shop"]) {
      const info = { username: "jane", description };
      await expect(refreshAddressBrand(info, update)).resolves.toBe(info);
    }
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps the existing address on failure and retries on the next lookup", async () => {
    const info = { username: "jane", description: "Pontspark wallet" };
    const update = jest.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ...info, description: "Paid jane on Clink" });
    await expect(refreshAddressBrand(info, update)).resolves.toBe(info);
    await expect(refreshAddressBrand(info, update)).resolves.toMatchObject({ description: "Paid jane on Clink" });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("uses the recipient's username for new requests and upgrades the previous Clink default", async () => {
    expect(receiveDescription("jane")).toBe("Paid jane on Clink");
    expect(receiveDescription()).toBe("Paid on Clink");
    const update = jest.fn(async (username: string, description: string) => ({ username, description }));
    await refreshAddressBrand({ username: "jane", description: "Clink wallet" }, update);
    expect(update).toHaveBeenCalledWith("jane", "Paid jane on Clink");
  });
});
