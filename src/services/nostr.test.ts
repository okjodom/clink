jest.mock("nostr-tools/pool", () => ({ SimplePool: jest.fn(() => ({ publish: mockPublish, destroy: jest.fn() })) }));

import type { Event } from "nostr-tools/pure";
import { publish, resetPool, setRelays } from "./nostr";

const mockPublish = jest.fn();
const event = { id: "test-event" } as Event;

beforeEach(() => {
  jest.useFakeTimers();
  mockPublish.mockReset();
  resetPool();
  setRelays(["wss://fast", "wss://slow"]);
});
afterEach(() => jest.useRealTimers());

it("returns after one relay accepts while a slow relay remains pending", async () => {
  mockPublish.mockReturnValue([Promise.resolve("accepted"), new Promise(() => undefined)]);
  expect(await publish(event)).toBe(event);
});

it("retries a failed replica in the background after returning success", async () => {
  let failReplica!: (error: Error) => void;
  mockPublish.mockReturnValueOnce([Promise.resolve("accepted"), new Promise((_resolve, reject) => { failReplica = reject; })]);
  mockPublish.mockReturnValue([Promise.resolve("accepted")]);
  await publish(event);
  failReplica(new Error("timeout"));
  await jest.advanceTimersByTimeAsync(5000);
  expect(mockPublish).toHaveBeenCalledTimes(2);
  expect(mockPublish.mock.calls[1][0]).toEqual(["wss://slow"]);
  expect(mockPublish.mock.calls[1][1]).toBe(event);
});

it("never reports success if every relay rejects the event", async () => {
  mockPublish.mockReturnValue([Promise.reject(new Error("offline")), Promise.reject(new Error("rejected"))]);
  await expect(publish(event)).rejects.toThrow("No relay accepted the event");
  expect(jest.getTimerCount()).toBe(0);
});
