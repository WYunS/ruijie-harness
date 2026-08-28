import { describe, expect, it, vi } from 'vitest'
import { confirmDesktopDirectoryAccess } from '../src/mac-directory-access.ts'

describe('macOS selected directory access', () => {
  it('probes an explicitly selected directory exactly once before it can be persisted', async () => {
    const probe = vi.fn(async () => {})
    await expect(confirmDesktopDirectoryAccess(
      'darwin',
      '/Users/new-user/Downloads',
      probe,
    )).resolves.toBe('/Users/new-user/Downloads')
    expect(probe).toHaveBeenCalledOnce()
    expect(probe).toHaveBeenCalledWith('/Users/new-user/Downloads')
  })

  it('fails closed after one denied probe without retrying or returning the path', async () => {
    const probe = vi.fn(async () => { throw Object.assign(new Error('denied'), { code: 'EPERM' }) })
    await expect(confirmDesktopDirectoryAccess(
      'darwin',
      '/Users/new-user/Documents',
      probe,
    )).rejects.toThrow('无法访问所选文件夹')
    expect(probe).toHaveBeenCalledOnce()
  })

  it('does not add an extra access probe on platforms without macOS TCC', async () => {
    const probe = vi.fn(async () => {})
    await expect(confirmDesktopDirectoryAccess('win32', 'C:\\Work', probe)).resolves.toBe('C:\\Work')
    expect(probe).not.toHaveBeenCalled()
  })
})
