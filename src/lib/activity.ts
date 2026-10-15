import type { WalletTx } from "../services/wallet";

export const ACTIVITY_FILTERS = [
  { value: "all", label: "All", icon: "list" },
  { value: "received", label: "Received", icon: "arrow-down" },
  { value: "sent", label: "Sent", icon: "arrow-up" },
  { value: "add-money", label: "Add money", icon: "plus-circle" },
  { value: "cash-out", label: "Cash out", icon: "minus-circle" },
  { value: "pending", label: "Pending", icon: "clock" },
] as const;

export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number]["value"];
type ActivityCategory = Exclude<ActivityFilter, "all" | "pending">;

/** Current and legacy swap payments use the same description format. */
export function swapPaymentPrefix(tx: WalletTx): string | undefined {
  return tx.description?.match(/^Pont(?:spark|more) swap ([0-9a-f]{8})$/)?.[1];
}

export function paymentCategory(tx: WalletTx, role?: "agent" | "customer"): ActivityCategory {
  const incoming = tx.direction === "in";
  if (swapPaymentPrefix(tx) || tx.kind === "htlc") {
    const adding = role === "agent" ? !incoming : incoming;
    return adding ? "add-money" : "cash-out";
  }
  return incoming ? "received" : "sent";
}

export function matchesActivityFilter(filter: ActivityFilter, category: ActivityCategory, pending: boolean): boolean {
  return filter === "all" || (filter === "pending" ? pending : filter === category);
}

export function paymentLabel(tx: WalletTx, role?: "agent" | "customer", name?: string): string {
  const incoming = tx.direction === "in";
  if (swapPaymentPrefix(tx)) {
    if (role === "agent") return `${incoming ? "Cash out" : "Add money"}${name ? ` via ${name}` : ""}`;
    return name ? `${incoming ? "Added" : "Cashed out"} via ${name}` : incoming ? "Added money" : "Cashed out";
  }
  if (tx.kind === "htlc") {
    if (incoming) return tx.htlc?.status === "waiting" ? "On its way" : "Added money";
    return tx.htlc?.status === "returned" ? "Returned to you" : tx.htlc?.status === "waiting" ? "Set aside for cash out" : "Cashed out";
  }
  return incoming ? "Received" : tx.recipient?.includes("@") ? `Paid ${tx.recipient.split("@")[0]}` : "Sent";
}

/** Match each search word across the same labels and details the user sees. */
export function matchesActivitySearch(query: string, fields: (string | undefined)[]): boolean {
  const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const text = normalize(fields.filter(Boolean).join(" "));
  return words.every((word) => text.includes(word));
}
