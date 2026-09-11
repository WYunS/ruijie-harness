import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(new URL(`../../vendor/dsh-vision-router/${path}`, import.meta.url), 'utf8')
const loadHardening = async () => {
  // @ts-expect-error The vendored plugin intentionally ships JavaScript sources without declarations.
  return import('../../vendor/dsh-vision-router/lib/structured-flow-hardening.js')
}

describe('Ruijie Vision Router long-task policy', () => {
  it('does not impose a cumulative turn deadline or a successful-call cap', async () => {
    const entry = source('entry.js')
    const { structuredDepthLimit, structuredTurnBudgetMs } = await loadHardening()

    expect(entry).toContain("visionTurnBudgetMs', z.number().step(1000).min(0).max(600000).default(0)")
    expect(entry).toContain("visionDepth', z.union(['fast', 'standard', 'deep', 'custom']).default('custom')")
    expect(structuredTurnBudgetMs({ visionTurnBudgetMs: 0 })).toBeUndefined()
    expect(structuredTurnBudgetMs({ visionTurnBudgetMs: 90_000 })).toBe(90_000)
    expect(structuredDepthLimit('custom', 0)).toBeUndefined()
  })

  it('allows a paid internal vision request enough time to finish', () => {
    const implementation = source('index.js')

    expect(implementation).toContain(
      'visionTaskTimeoutMs: z.number().step(1).min(1000).max(180000).default(120000)',
    )
  })

  it('describes an exhausted finite guard as processing time, not account quota', () => {
    const hardening = source('lib/structured-flow-hardening.js')

    expect(hardening).toContain('本轮视觉处理时间上限已到（不是账户额度）')
  })
})
