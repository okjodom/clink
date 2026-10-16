/** Process one incoming event per turn, leaving time for touches between events. */
export function eventQueue<T>(process: (item: T) => void | Promise<void>, onError: (error: unknown) => void) {
  let pending: T[] = [];
  let head = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let executing = false;
  const next = () => {
    timer = undefined;
    if (stopped || head === pending.length) { pending = []; head = 0; return; }
    const item = pending[head++];
    executing = true;
    try { void Promise.resolve(process(item)).catch(onError); }
    catch (error) { onError(error); }
    executing = false;
    // Async network waits do not hold up unrelated messages.
    if (head < pending.length) timer = setTimeout(next, 0);
    else { pending = []; head = 0; }
  };
  return {
    push(item: T) {
      if (stopped) return;
      pending.push(item);
      if (!executing && timer === undefined) timer = setTimeout(next, 0);
    },
    stop() { stopped = true; clearTimeout(timer); timer = undefined; pending = []; head = 0; },
  };
}
