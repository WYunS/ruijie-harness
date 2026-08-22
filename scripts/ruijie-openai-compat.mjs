/** Official V4 routes implement the DeepSeek thinking contract end to end. */
function supportsDeepSeekThinking(model) {
  return typeof model === 'string' && /^deepseek-v4-(?:flash|pro)(?:-|$)/u.test(model)
}

/** GPTAuth's non-DeepSeek OpenAI-compatible routes may reject DeepSeek-only fields. */

export function normalizeChatCompletionsPayload(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return payload
  const normalized = { ...payload }
  if (!supportsDeepSeekThinking(normalized.model)) delete normalized.thinking
  return normalized
}
