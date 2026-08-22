import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeChatCompletionsPayload } from './ruijie-openai-compat.mjs'

test('removes the DeepSeek-only thinking field from non-DeepSeek chat requests', () => {
  const source = {
    model: 'ray 智能推荐(默认)',
    messages: [{ role: 'user', content: '你好' }],
    stream: true,
    thinking: { type: 'disabled' },
    tools: [{ type: 'function', function: { name: 'read' } }],
  }

  assert.deepEqual(normalizeChatCompletionsPayload(source), {
    model: source.model,
    messages: source.messages,
    stream: true,
    tools: source.tools,
  })
  assert.deepEqual(source.thinking, { type: 'disabled' })
})

test('preserves official DeepSeek V4 thinking and effort fields', () => {
  const source = {
    model: 'deepseek-v4-flash',
    messages: [{ role: 'user', content: '你好' }],
    stream: true,
    thinking: { type: 'enabled' },
    reasoning_effort: 'high',
  }

  assert.deepEqual(normalizeChatCompletionsPayload(source), source)
})

test('leaves non-object payloads unchanged', () => {
  assert.equal(normalizeChatCompletionsPayload(null), null)
  assert.equal(normalizeChatCompletionsPayload('body'), 'body')
})
