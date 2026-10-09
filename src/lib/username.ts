/** "Jane Wanjiru" -> "janewanjiru": the part of an address before the @. */
export function usernameFrom(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
}

/** A bare username pays someone on the same service: "jane" -> "jane@your.domain". */
export function expandUsername(input: string, ownAddress: string | null): string {
  const v = input.trim();
  const domain = ownAddress?.split("@")[1];
  const looksLikeCode = /^(lnbc|lntb|lntbs|lnbcrt|lnurl|bc1|tb1|sp1|spark1)/i.test(v);
  return domain && !looksLikeCode && /^[a-z0-9][a-z0-9._-]{2,30}$/i.test(v) ? `${v.toLowerCase()}@${domain}` : v;
}
