import { describe, expect, it } from 'vitest'
import { isSessionActivelyRunning } from '../src/session-deletion-policy.ts'

describe('session deletion policy', () => {
  it('allows a session that was opened before but whose turn has finished', () => {
    expect(isSessionActivelyRunning([
      { type: 'turn/start', data: { turn: 1 } },
      { type: 'turn/end', data: { turn: 1, reason: 'complete' } },
    ])).toBe(false)
  })

  it('still protects a session with an open turn', () => {
    expect(isSessionActivelyRunning([
      { type: 'turn/start', data: { turn: 2 } },
    ])).toBe(true)
  })

  it('does not treat merely loading an idle session as running', () => {
    expect(isSessionActivelyRunning([])).toBe(false)
  })
})
