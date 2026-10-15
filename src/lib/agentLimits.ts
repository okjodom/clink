import type { Market } from "../store/agent";

export const MAX_AGENT_MARGIN_PCT = 5;

/** Keep the existing discount range while capping the fee an agent can charge. */
export function validAgentMargin(value: number): boolean {
  return Number.isFinite(value) && value >= -5 && value <= MAX_AGENT_MARGIN_PCT;
}

export function agentMarginError(markets: readonly Market[]): string | null {
  for (const market of markets) {
    if ([market.buy, market.sell].some((side) => side.enabled && !validAgentMargin(side.spreadPct))) {
      return `${market.currency}: fees must be between -5% and ${MAX_AGENT_MARGIN_PCT}%.`;
    }
  }
  return null;
}
