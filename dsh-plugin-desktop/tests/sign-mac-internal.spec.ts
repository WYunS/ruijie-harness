import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { afterPack, signMacInternalApp } from '../scripts/sign-mac-internal.ts'

const roots: string[] = []

function writeMachO(path: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0, 0, 0, 0]))
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('internal macOS ad-hoc signing', () => {
  it.each([1, 3])('skips the temporary architecture %s before universal merging', async (arch) => {
    await expect(afterPack({
      appOutDir: '/temporary-app-that-must-not-be-read',
      arch,
      electronPlatformName: 'darwin',
      packager: { appInfo: { productFilename: '锐捷 Harness' } },
    })).resolves.toBeUndefined()
  })

  it('signs Mach-O files and nested bundles inside-out before sealing the app', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-mac-sign-'))
    roots.push(root)
    const appPath = join(root, '锐捷 Harness.app')
    const helperApp = join(appPath, 'Contents', 'Frameworks', '锐捷 Harness Helper.app')
    const main = join(appPath, 'Contents', 'MacOS', '锐捷 Harness')
    const helper = join(helperApp, 'Contents', 'MacOS', '锐捷 Harness Helper')
    writeMachO(main)
    writeMachO(helper)
    mkdirSync(join(appPath, 'Contents', 'Resources'), { recursive: true })
    writeFileSync(join(appPath, 'Contents', 'Resources', 'plain.txt'), 'not code')

    const calls: Array<{ command: string; args: readonly string[] }> = []
    const result = signMacInternalApp({
      appPath,
      platform: 'darwin',
      run: (command, args) => calls.push({ command, args: [...args] }),
      log: () => undefined,
    })

    expect(result.machOPaths).toEqual([helper, main])
    expect(result.bundlePaths).toEqual([helperApp, appPath])
    const signedPaths = calls
      .filter(call => call.args.includes('--sign'))
      .map(call => call.args.at(-1))
    expect(signedPaths).toEqual([helper, main, helperApp, appPath])
    expect(calls.at(-1)).toEqual({
      command: 'codesign',
      args: ['--verify', '--deep', '--strict', '--verbose=2', appPath],
    })
  })

  it('rejects non-macOS execution before signing', () => {
    expect(() => signMacInternalApp({
      appPath: '/tmp/锐捷 Harness.app',
      platform: 'win32',
      run: () => undefined,
      log: () => undefined,
    })).toThrow('native macOS host')
  })
})
