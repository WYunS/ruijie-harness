import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('../src/client/styles.ts', import.meta.url), 'utf8')

describe('appearance compatibility', () => {
  it('does not block user-selected appearance accents from recoloring message bubbles', () => {
    expect(styles).not.toContain('NATIVE_BUBBLE_STYLES')
    expect(styles).not.toContain('--dsw-specific-bubble:')
    expect(styles).not.toContain('--dsw-specific-bubble-highlight:')
  })
})
