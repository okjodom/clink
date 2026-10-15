import { BRAND } from "../brand";

export function receiveDescription(username?: string): string {
  return username ? `Paid ${username} on ${BRAND.name}` : `Paid on ${BRAND.name}`;
}

/** Change only our former default, preserving descriptions written by people. */
export function paymentDescription(description: string | undefined, recipientAddress?: string): string | undefined {
  if (!description) return description;
  const legacy = /^(pontspark|clink)( wallet)?$/i.test(description.trim());
  const username = recipientAddress?.match(/^([^\s@]+)@[^\s@]+$/)?.[1];
  return legacy ? receiveDescription(username) : description;
}

interface AddressDescription { username: string; description: string }

/** Re-register the same owned username to refresh its LNURL metadata in place. */
export async function refreshAddressBrand<T extends AddressDescription>(info: T, update: (username: string, description: string) => Promise<T>): Promise<T> {
  if (!/^(pontspark|clink)( wallet)?$/i.test(info.description.trim())) return info;
  const description = receiveDescription(info.username);
  try { return await update(info.username, description); }
  catch { return info; } // Keep receiving available offline; retry next time it is read.
}
