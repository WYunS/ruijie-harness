import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/search-recovery.ts'
import { SEARCH_RECOVERY_PROMPT } from '../src/search-recovery-policy.ts'

describe('desktop search recovery policy plugin', () => {
  it('registers one ordered policy section through the system prompt service', () => {
    const dispose = vi.fn()
    const section = vi.fn(() => dispose)
    const effect = vi.fn((factory: () => () => void) => factory())
    apply({ systemPrompt: { section }, effect } as never)

    expect(section).toHaveBeenCalledWith({
      name: 'ruijie-desktop:search-recovery',
      order: 175,
      text: SEARCH_RECOVERY_PROMPT,
    })
    expect(effect).toHaveBeenCalledOnce()
  })
})
