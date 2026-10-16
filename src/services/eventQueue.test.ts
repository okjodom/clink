import { eventQueue } from "./eventQueue";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it("yields between events instead of processing a catch-up burst in one turn", () => {
  const processed: number[] = [];
  const queue = eventQueue<number>((item) => { processed.push(item); }, jest.fn());
  queue.push(1); queue.push(2); queue.push(3);
  expect(processed).toEqual([]);
  jest.advanceTimersByTime(0);
  expect(processed).toEqual([1]);
  jest.runAllTimers();
  expect(processed).toEqual([1, 2, 3]);
});

it("does not let a network wait block another event, and catches failures", async () => {
  const failed = jest.fn();
  const processed: number[] = [];
  const queue = eventQueue<number>((item) => {
    processed.push(item);
    if (item === 1) return new Promise<void>(() => undefined);
    if (item === 2) throw new Error("bad message");
    return Promise.reject(new Error("network"));
  }, failed);
  [1, 2, 3].forEach(queue.push);
  await jest.runAllTimersAsync();
  expect(processed).toEqual([1, 2, 3]);
  expect(failed).toHaveBeenCalledTimes(2);
});

it("cancels queued work on account changes and accepts reentrant events only once", () => {
  const processed: number[] = [];
  const queue = eventQueue<number>((item) => { processed.push(item); if (item === 1) queue.push(2); }, jest.fn());
  queue.push(1);
  jest.runAllTimers();
  expect(processed).toEqual([1, 2]);
  queue.push(3); queue.stop(); queue.push(4);
  jest.runAllTimers();
  expect(processed).toEqual([1, 2]);
});
