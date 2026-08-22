import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  accountSummaryFromPayloads,
  ensureRuijieAuthEnvironment,
  normalizeRuijieChatPayload,
} from '../src/ruijie-auth.ts'

const authSource = readFileSync(new URL('../src/ruijie-auth.ts', import.meta.url), 'utf8')

function unsignedJwt(payload: object): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`
}

describe('Ruijie desktop authentication module', () => {
  it('does not expose an environment-key bypass around SSO', () => {
    const source = ensureRuijieAuthEnvironment.toString()
    expect(source).not.toContain('existingKey')
    expect(source).not.toContain('managed: false')
  })

  it('restores protected credentials before requesting interactive authorization', () => {
    const restore = authSource.indexOf('options.credentialStore.load()')
    const authorize = authSource.indexOf("options.onStatus?.('authorization-required')")
    expect(restore).toBeGreaterThan(0)
    expect(authorize).toBeGreaterThan(restore)
    expect(authSource).toContain('options.credentialStore?.save(tokens)')
    expect(authSource).toContain('credentialStore?.clear()')
  })

  it('requests the dedicated Harness consent experience from GPTAuth', () => {
    expect(authSource).toContain("product: 'harness'")
  })

  it('shows a branded completion page and only attempts best-effort auto-close', () => {
    expect(authSource).toContain("'cache-control': 'no-store'")
    expect(authSource).toContain("history.replaceState(null,'','/auth/callback')")
    expect(authSource).toContain('window.close()')
    expect(authSource).not.toContain('<body hidden>')
    expect(authSource).toContain('<title>授权完成 · 锐捷 Harness</title>')
    expect(authSource).toContain('<h1>授权已完成</h1>')
    expect(authSource).toContain('现在可以关闭此页面')
    expect(authSource).toContain('#d71920')
  })

  it('preserves V4 reasoning controls and removes them from generic routes', () => {
    const thinking = { type: 'enabled' }
    expect(normalizeRuijieChatPayload({
      model: 'deepseek-v4-flash',
      thinking,
      reasoning_effort: 'high',
    })).toEqual({
      model: 'deepseek-v4-flash',
      thinking,
      reasoning_effort: 'high',
    })
    expect(normalizeRuijieChatPayload({ model: 'ray', thinking })).toEqual({ model: 'ray' })
  })

  it('preserves native multimodal message parts through the Ruijie proxy normalizer', () => {
    const content = [
      { type: 'text', text: '这张图里有什么？' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } },
    ]
    expect(normalizeRuijieChatPayload({
      model: 'gpt-5.6-luna',
      messages: [{ role: 'user', content }],
    })).toEqual({
      model: 'gpt-5.6-luna',
      messages: [{ role: 'user', content }],
    })
  })

  it('maps the same GPTAuth wallet fields as Ruijie Codex to the signed-in user', () => {
    const result = accountSummaryFromPayloads(
      unsignedJwt({ sub: '42', name: 'WYS', email: 'wys@ruijie.com.cn' }),
      { total_usage: 94_778.8916 },
      { hard_limit_usd: 2739.726028 },
    )

    expect(result.authentication).toBe('sso')
    expect(result.account).toEqual({ id: '42', name: 'WYS', email: 'wys@ruijie.com.cn' })
    expect(result.billing).toEqual({
      currency: 'CNY',
      total: 2739.726028,
      used: 947.788916,
      remaining: 1791.937112,
      usedPercent: 34.59429542638925,
    })
  })
})
