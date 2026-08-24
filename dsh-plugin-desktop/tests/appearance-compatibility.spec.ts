import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('../src/client/styles.ts', import.meta.url), 'utf8')

describe('appearance compatibility', () => {
  it('keeps user-message bubbles on the stock light and dark surfaces', () => {
    expect(styles).toContain('--dsw-specific-bubble: var(--dsw-static-deepseek-50) !important')
    expect(styles).toContain('--dsw-specific-bubble: var(--dsw-static-neutral-bluish-850) !important')
  })
})
