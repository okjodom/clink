import { identityFrom, usernameToReclaim, type SignedEvent } from "./identity";

const ME = "a".repeat(64);
const THEM = "b".repeat(64);

const ev = (over: Partial<SignedEvent>): SignedEvent => ({
  id: "0".repeat(64),
  pubkey: ME,
  kind: 0,
  created_at: 100,
  tags: [],
  content: "{}",
  ...over,
});

describe("identityFrom", () => {
  it("returns null when nothing was published", () => {
    expect(identityFrom([], ME)).toBeNull();
  });

  it("reads name, about and username from the newest profile", () => {
    const got = identityFrom(
      [
        ev({ created_at: 100, content: JSON.stringify({ name: "Old name" }) }),
        ev({ id: "1".repeat(64), created_at: 200, content: JSON.stringify({ name: " Ana ", about: "Hi", lud16: "Ana@Breez.Tips" }) }),
      ],
      ME,
    );
    expect(got).toEqual({ name: "Ana", about: "Hi", lud16: "ana@breez.tips" });
  });

  it("ignores events signed by someone else", () => {
    expect(identityFrom([ev({ pubkey: THEM, content: JSON.stringify({ name: "Mallory" }) })], ME)).toBeNull();
  });

  it("falls back to display_name and drops a malformed lightning address", () => {
    expect(identityFrom([ev({ content: JSON.stringify({ display_name: "Ana", lud16: "not an address" }) })], ME)).toEqual({ name: "Ana", about: "" });
  });

  it("keeps the relay list even if the profile is unreadable", () => {
    const got = identityFrom(
      [
        ev({ content: "not json" }),
        ev({ kind: 10002, tags: [["r", "wss://relay.one"], ["r", "wss://relay.one"], ["r", "http://nope"], ["p", "x"]] }),
      ],
      ME,
    );
    expect(got).toEqual({ name: "", about: "", relays: ["wss://relay.one"] });
  });
});

describe("usernameToReclaim", () => {
  it("takes the username on the wallet's own service", () => {
    expect(usernameToReclaim("ana@breez.tips", "breez.tips")).toBe("ana");
    expect(usernameToReclaim("ana@breez.tips", null)).toBe("ana");
  });
  it("skips other services and missing addresses", () => {
    expect(usernameToReclaim("ana@other.example", "breez.tips")).toBeNull();
    expect(usernameToReclaim(undefined, "breez.tips")).toBeNull();
  });
});
