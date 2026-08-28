import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { desktopWorkingDirectory } from '../src/desktop-working-directory.ts'

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')

describe('desktop working directory', () => {
  it.each([
    '/Users/new-user/Downloads',
    '/Volumes/Ruijie Harness',
    '/',
  ])('never inherits the packaged launch directory %s as the Host cwd', launchDirectory => {
    expect(desktopWorkingDirectory({
      isPackaged: true,
      launchDirectory,
      applicationDataDirectory: '/Users/new-user/Library/Application Support/Ruijie Harness',
    })).toBe(join('/Users/new-user/Library/Application Support/Ruijie Harness', 'runtime-cwd'))
  })

  it('preserves the developer shell directory outside a packaged app', () => {
    expect(desktopWorkingDirectory({
      isPackaged: false,
      launchDirectory: '/code/ruijie-harness',
      applicationDataDirectory: '/Users/developer/Library/Application Support/Ruijie Harness',
    })).toBe('/code/ruijie-harness')
  })

  it('normalizes and creates the private Host cwd before profile configuration is loaded', () => {
    const resolveWorkingDirectory = main.indexOf('desktopWorkingDirectory({')
    const createWorkingDirectory = main.indexOf('mkdirSync(workingDirectory, { recursive: true })')
    const enterWorkingDirectory = main.indexOf('process.chdir(workingDirectory)')
    const loadEnvironment = main.indexOf('loadLayeredEnv(BIN_NAME, process.cwd())')

    expect(resolveWorkingDirectory).toBeGreaterThan(0)
    expect(createWorkingDirectory).toBeGreaterThan(resolveWorkingDirectory)
    expect(enterWorkingDirectory).toBeGreaterThan(createWorkingDirectory)
    expect(loadEnvironment).toBeGreaterThan(enterWorkingDirectory)
  })
})
