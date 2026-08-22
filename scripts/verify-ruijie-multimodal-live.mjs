/** Live GPTAuth image-understanding probe without printing credentials. */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const baseUrl = 'https://gptauth.ruijie.com.cn/v1'
const model = process.argv[2] || 'gpt-5.6-luna'
const isDeepSeekV4 = /^deepseek-v4-(?:flash|pro)$/u.test(model)
const iconPath = resolve('dsh-plugin-desktop/build/app-icon.png')
const auth = JSON.parse(readFileSync(join(homedir(), '.codex', 'auth.json'), 'utf8'))
const apiKey = auth.OPENAI_API_KEY
if (typeof apiKey !== 'string' || apiKey.length === 0) {
  throw new Error('锐捷 Codex auth.json 没有可用的 API Key。')
}

const image = readFileSync(iconPath).toString('base64')
const response = await fetch(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Read the two large white letters in this application icon. Reply with exactly those two letters and nothing else.',
        },
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${image}` },
        },
      ],
    }],
    stream: false,
    temperature: 0,
    ...(isDeepSeekV4 ? { thinking: { type: 'disabled' } } : {}),
    max_tokens: 128,
  }),
})
const text = await response.text()
let payload
try {
  payload = JSON.parse(text)
} catch {
  throw new Error(`GPTAuth returned non-JSON HTTP ${String(response.status)}: ${text.slice(0, 200)}`)
}
if (!response.ok) {
  throw new Error(`GPTAuth returned HTTP ${String(response.status)}: ${JSON.stringify(payload)}`)
}

const reply = payload.choices?.[0]?.message?.content?.trim()
if (reply !== 'RJ') {
  throw new Error(`GPTAuth did not read the packaged RJ icon through ${model}; reply=${JSON.stringify(reply)}`)
}
console.log(JSON.stringify({
  requestedModel: model,
  responseModel: payload.model ?? null,
  reply,
  usage: payload.usage ?? null,
}, null, 2))
