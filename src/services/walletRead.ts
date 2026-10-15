/** Native wallet reads stay responsive while the SDK's full network sync runs.
 * Decisions based on absence (such as cancelling a funded swap) must require sync.
 */
const backgroundStarted = new WeakMap<() => Promise<void>, number>();

export async function readWalletState<T>(read: () => Promise<T | null>, sync: () => Promise<void>, options?: { requireSync?: boolean; skipSync?: boolean }): Promise<T | null> {
  if (options?.requireSync) await sync();
  const value = await read();
  if (value === null && !options?.requireSync && !options?.skipSync && Date.now() - (backgroundStarted.get(sync) ?? -Infinity) >= 5000) {
    backgroundStarted.set(sync, Date.now());
    void sync().catch(() => undefined);
  }
  return value;
}
