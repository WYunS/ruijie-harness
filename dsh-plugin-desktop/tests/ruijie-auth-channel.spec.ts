import { describe, expect, it, vi } from 'vitest'
import { createInheritedRuijieAuthChannel } from '../src/ruijie-auth-channel.ts'

describe('inherited Ruijie authentication channel', () => {
  it('is absent unless both private descriptors are supplied', () => {
    expect(createInheritedRuijieAuthChannel({}, vi.fn())).toBeUndefined()
    expect(() => createInheritedRuijieAuthChannel({ RUIJIE_DSH_AUTH_INPUT_FD: '3' }, vi.fn()))
      .toThrow('invalid inherited authentication channel')
  })
})
