import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('../src/client/styles.ts', import.meta.url), 'utf8')

describe('appearance compatibility', () => {
  it('keeps macOS advanced mode and Windows compatibility mode on the stock message surfaces', () => {
    expect(styles).toContain('const NATIVE_BUBBLE_STYLES = `')
    expect(styles).toContain('--dsw-specific-bubble: var(--dsw-static-deepseek-50) !important')
    expect(styles).toContain('--dsw-specific-bubble-highlight: var(--dsw-static-deepseek-200) !important')
    expect(styles).toContain('--dsw-specific-bubble: var(--dsw-static-neutral-bluish-850) !important')
    expect(styles).toContain('--dsw-specific-bubble-highlight: var(--dsw-static-neutral-bluish-750) !important')
    expect(styles.match(/\$\{NATIVE_BUBBLE_STYLES\}/gu)).toHaveLength(2)
  })
})
