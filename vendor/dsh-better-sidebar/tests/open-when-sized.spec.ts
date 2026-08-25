import { describe, expect, it, vi } from 'vitest'
import { openWhenSized } from '../src/client/open-when-sized.ts'

interface HostState {
  isConnected: boolean
  clientWidth: number
  clientHeight: number
}

function frameHarness() {
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  return {
    raf: (callback: FrameRequestCallback): number => {
      const id = nextId++
      callbacks.set(id, callback)
      return id
    },
    caf: (id: number): void => { callbacks.delete(id) },
    runFrame: (): void => {
      const queued = [...callbacks.values()]
      callbacks.clear()
      for (const callback of queued) callback(0)
    },
    pending: (): number => callbacks.size,
  }
}

describe('openWhenSized', () => {
  it('recovers when a session switch temporarily detaches the terminal host', () => {
    const host: HostState = { isConnected: false, clientWidth: 0, clientHeight: 0 }
    const frames = frameHarness()
    const open = vi.fn()

    openWhenSized(host as HTMLElement, open, frames.raf, frames.caf)
    frames.runFrame()

    host.isConnected = true
    host.clientWidth = 900
    host.clientHeight = 240
    frames.runFrame()

    expect(open).toHaveBeenCalledOnce()
  })

  it('cancels polling when the terminal view unmounts', () => {
    const host: HostState = { isConnected: false, clientWidth: 0, clientHeight: 0 }
    const frames = frameHarness()
    const open = vi.fn()

    const cancel = openWhenSized(host as HTMLElement, open, frames.raf, frames.caf)
    expect(frames.pending()).toBe(1)

    cancel()
    expect(frames.pending()).toBe(0)
    frames.runFrame()
    expect(open).not.toHaveBeenCalled()
  })
})
