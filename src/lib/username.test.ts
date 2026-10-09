import { expandUsername, usernameFrom } from "./username";

describe("usernameFrom", () => {
  it("keeps letters and digits only", () => {
    expect(usernameFrom("Jane Wanjiru")).toBe("janewanjiru");
    expect(usernameFrom("Zoë O'Neil 2")).toBe("zoeoneil2");
  });
  it("caps the length", () => {
    expect(usernameFrom("a".repeat(40))).toHaveLength(24);
  });
});

describe("expandUsername", () => {
  it("adds your own domain to a bare username", () => {
    expect(expandUsername(" Jane ", "me@pay.example")).toBe("jane@pay.example");
  });
  it("leaves addresses, codes and unknown domains alone", () => {
    expect(expandUsername("jane@other.example", "me@pay.example")).toBe("jane@other.example");
    expect(expandUsername("lnbc1500n1pj9", "me@pay.example")).toBe("lnbc1500n1pj9");
    expect(expandUsername("jane", null)).toBe("jane");
  });
});
