import { describe, expect, it, vi } from 'vitest'
import { DesktopDirectoryPickCycle } from '../src/client/mac-directory-flow.tsx'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe('macOS desktop directory flow', () => {
  it('opens exactly one app-owned picker for one open cycle despite repeated renders', async () => {
    const selected = deferred<string | null>()
    const pick = vi.fn(() => selected.promise)
    const onPicked = vi.fn()
    const cycle = new DesktopDirectoryPickCycle()

    cycle.update({ open: true, busy: false, pick, onPicked, onCancel: vi.fn(), onError: vi.fn() })
    cycle.update({ open: true, busy: false, pick, onPicked, onCancel: vi.fn(), onError: vi.fn() })
    cycle.update({ open: true, busy: false, pick, onPicked, onCancel: vi.fn(), onError: vi.fn() })
    expect(pick).toHaveBeenCalledOnce()

    selected.resolve('/Users/new-user/Downloads')
    await selected.promise
    await Promise.resolve()
    expect(onPicked).toHaveBeenCalledOnce()
    expect(onPicked).toHaveBeenCalledWith('/Users/new-user/Downloads')
    expect(pick).toHaveBeenCalledOnce()
  })

  it('does not retry a cancelled or failed picker until the owner closes and reopens it', async () => {
    const pick = vi.fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('permission denied'))
    const onCancel = vi.fn()
    const onError = vi.fn()
    const cycle = new DesktopDirectoryPickCycle()
    const props = { open: true, busy: false, pick, onPicked: vi.fn(), onCancel, onError }

    cycle.update(props)
    await Promise.resolve()
    await Promise.resolve()
    cycle.update(props)
    expect(pick).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledOnce()

    cycle.update({ ...props, open: false })
    cycle.update(props)
    await Promise.resolve()
    await Promise.resolve()
    cycle.update(props)
    expect(pick).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith('permission denied')
  })

  it('drops a late picker result after the flow is disposed', async () => {
    const selected = deferred<string | null>()
    const onPicked = vi.fn()
    const cycle = new DesktopDirectoryPickCycle()
    cycle.update({
      open: true,
      busy: false,
      pick: () => selected.promise,
      onPicked,
      onCancel: vi.fn(),
      onError: vi.fn(),
    })

    cycle.dispose()
    selected.resolve('/Users/new-user/Documents')
    await selected.promise
    await Promise.resolve()
    expect(onPicked).not.toHaveBeenCalled()
  })
})
