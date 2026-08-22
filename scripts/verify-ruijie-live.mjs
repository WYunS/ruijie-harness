/** Live, read-mostly GPTAuth verification without printing credentials. */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const BASE_URL = 'https://gptauth.ruijie.com.cn/v1'
const MODEL = process.argv[2] || 'deepseek-v4-flash'
const EFFORT = process.argv[3] || 'high'
const ALLOWED_EFFORTS = new Set(['off', 'low', 'high', 'max'])

if (!/^deepseek-v4-(?:flash|pro)$/u.test(MODEL)) {
  throw new Error(`Unsupported live-verification model: ${MODEL}`)
}
if (!ALLOWED_EFFORTS.has(EFFORT)) {
  throw new Error(`Unsupported live-verification reasoning effort: ${EFFORT}`)
}

const auth = JSON.parse(readFileSync(join(homedir(), '.codex', 'auth.json'), 'utf8'))
const apiKey = auth.OPENAI_API_KEY
if (typeof apiKey !== 'string' || apiKey.length === 0) {
  throw new Error('锐捷 Codex auth.json 没有可用的 API Key。')
}

const headers = {
  authorization: `Bearer ${apiKey}`,
  'content-type': 'application/json',
}

async function requestJson(path, init = {}) {
  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers: { ...headers, ...init.headers } })
  const text = await response.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    payload = { message: text.slice(0, 500) }
  }
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}: ${JSON.stringify(payload)}`)
  }
  return payload
}

async function billingUsage() {
  const payload = await requestJson('/dashboard/billing/usage')
  if (typeof payload.total_usage !== 'number') throw new Error('GPTAuth usage response has no total_usage.')
  return payload.total_usage
}

const before = await billingUsage()
const thinking = EFFORT === 'off' ? { type: 'disabled' } : { type: 'enabled' }
const request = {
  model: MODEL,
  messages: [{ role: 'user', content: 'Reply with exactly: V4 live verification passed' }],
  stream: false,
  thinking,
  ...(EFFORT === 'off' ? {} : { reasoning_effort: EFFORT }),
  max_tokens: 128,
}
const completion = await requestJson('/chat/completions', {
  method: 'POST',
  body: JSON.stringify(request),
})
const after = await billingUsage()
const message = completion.choices?.[0]?.message ?? {}
const reasoning = message.reasoning_content ?? message.reasoning ?? ''

console.log(JSON.stringify({
  requestedModel: MODEL,
  responseModel: completion.model ?? null,
  reasoningEffort: EFFORT,
  thinking,
  reply: message.content ?? null,
  hasReasoning: typeof reasoning === 'string' && reasoning.length > 0,
  reasoningPreview: typeof reasoning === 'string' ? reasoning.slice(0, 120) : '',
  usage: completion.usage ?? null,
  billingBefore: before,
  billingAfter: after,
  billingDelta: after - before,
}, null, 2))
