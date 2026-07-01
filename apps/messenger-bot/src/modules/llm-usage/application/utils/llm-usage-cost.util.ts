/** Env suffix: gpt-5.4 → GPT_5_4 */
export function normalizeModelForEnvKey(model: string): string {
  return model.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
}

export function buildInputCostEnvKey(model: string): string {
  return `LLM_COST_USD_PER_1M_INPUT_TOKENS_${normalizeModelForEnvKey(model)}`;
}

export function buildOutputCostEnvKey(model: string): string {
  return `LLM_COST_USD_PER_1M_OUTPUT_TOKENS_${normalizeModelForEnvKey(model)}`;
}

export function estimateCostUsd(
  promptTokens: number,
  completionTokens: number,
  inputUsdPer1M: number | null,
  outputUsdPer1M: number | null,
): string | null {
  if (inputUsdPer1M === null || outputUsdPer1M === null) {
    return null;
  }

  const cost =
    (promptTokens / 1_000_000) * inputUsdPer1M +
    (completionTokens / 1_000_000) * outputUsdPer1M;

  return cost.toFixed(6);
}

export function addCostUsdStrings(
  a: string | null,
  b: string | null,
): string | null {
  if (a === null && b === null) {
    return null;
  }

  const total = Number(a ?? 0) + Number(b ?? 0);
  return total.toFixed(6);
}
