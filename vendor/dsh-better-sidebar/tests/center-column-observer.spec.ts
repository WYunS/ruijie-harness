import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeCenterColumnChanges } from '../src/client/center-column-observer.ts'

describe('observeCenterColumnChanges', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('watches nested replacements made when a conversation starts running', () => {
    let options: MutationObserverInit | undefined
    let callback: MutationCallback | undefined
    const disconnect = vi.fn()
    vi.stubGlobal('MutationObserver', class {
      constructor(next: MutationCallback) { callback = next }
      observe(_root: Node, next: MutationObserverInit): void { options = next }
      disconnect = disconnect
    })

    const locate = vi.fn()
    const stop = observeCenterColumnChanges({} as HTMLElement, locate)

    expect(options).toEqual({ childList: true, subtree: true })

    const unrelated = {
      nodeType: 1,
      matches: () => false,
      querySelector: () => null,
    } as unknown as Node
    callback?.([{ addedNodes: [unrelated], removedNodes: [] } as unknown as MutationRecord], {} as MutationObserver)
    expect(locate).not.toHaveBeenCalled()

    const conversation = {
      nodeType: 1,
      matches: (selector: string) => selector.includes('[data-slot="conversation"]'),
      querySelector: () => null,
    } as unknown as Node
    callback?.([{ addedNodes: [conversation], removedNodes: [] } as unknown as MutationRecord], {} as MutationObserver)
    expect(locate).toHaveBeenCalledOnce()

    stop()
    expect(disconnect).toHaveBeenCalledOnce()
  })
})
