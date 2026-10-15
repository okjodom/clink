/** Mainnet explorers for blockchain transactions, never wallet-internal payment IDs. */
export function transactionExplorer(chain: string, txId: string | undefined): string | undefined {
  if (!txId) return undefined;
  const network = chain.trim().toLowerCase();
  if (network === "bitcoin") return /^[a-f0-9]{64}$/i.test(txId) ? `https://mempool.space/tx/${txId}` : undefined;
  if (network === "solana") return /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(txId) ? `https://solscan.io/tx/${txId}` : undefined;
  if (network === "tron") return /^[a-f0-9]{64}$/i.test(txId) ? `https://tronscan.org/#/transaction/${txId}` : undefined;
  const domains: Record<string, string> = {
    ethereum: "etherscan.io", base: "basescan.org", arbitrum: "arbiscan.io", "arbitrum one": "arbiscan.io",
    optimism: "optimistic.etherscan.io", polygon: "polygonscan.com", bsc: "bscscan.com", "bnb chain": "bscscan.com", avalanche: "snowtrace.io",
  };
  return domains[network] && /^0x[a-f0-9]{64}$/i.test(txId) ? `https://${domains[network]}/tx/${txId}` : undefined;
}
