/**
 * Fleet token-cost pricing — single source of truth.
 *
 * The same Claude Sonnet 4 pricing table + token→USD estimator was duplicated
 * verbatim in fleet-budget.ts and fleet-report.ts (and a third hardcoded variant
 * lived inline in fleet-intelligence.ts). Centralizing it here keeps the pricing
 * assumptions consistent across budgets, reports, canary cost guardrails, and
 * capacity forecasts.
 */

// Claude Sonnet 4 pricing — USD per million tokens.
export const INPUT_COST_PER_M = 3;
export const OUTPUT_COST_PER_M = 15;
export const CACHED_COST_PER_M = 0.3;

/**
 * Estimate USD cost from raw token counts (unrounded).
 *
 * `cached` is the cached-input subset of `input`, billed at the cheaper cached
 * rate; the remaining `input - cached` tokens bill at the full input rate.
 */
export function estimateTokenCostUsd(
  input: number,
  output: number,
  cached: number,
): number {
  const billableInput = Math.max(0, input - cached);
  const inputCost = (billableInput / 1_000_000) * INPUT_COST_PER_M;
  const cachedCost = (cached / 1_000_000) * CACHED_COST_PER_M;
  const outputCost = (output / 1_000_000) * OUTPUT_COST_PER_M;
  return inputCost + cachedCost + outputCost;
}
