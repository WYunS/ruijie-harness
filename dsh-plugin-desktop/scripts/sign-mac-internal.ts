/** Seal the internal macOS application with a complete ad-hoc signature. */

import { closeSync, lstatSync, openSync, readSync, readdirSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import verifyPackagedRuntime, {
  type PackagedRuntimeContext,
} from './verify-packaged-runtime.ts'

const MACH_O_MAGICS = new Set([
  0xfeedface,
  0xcefaedfe,
  0xfeedfacf,
  0xcffaedfe,
  0xcafebabe,
  0xbebafeca,
  0xcafebabf,
  0xbfbafeca,
])

const CODE_BUNDLE_EXTENSIONS = new Set([
  '.app',
  '.appex',
  '.bundle',
  '.framework',
  '.plugin',
  '.service',
  '.xpc',
])

export interface MacInternalSignOptions {
  readonly appPath: string
  readonly platform: NodeJS.Platform
  readonly run: (command: string, args: readonly string[]) => void
  readonly log: (message: string) => void
}

export interface MacInternalSignResult {
  readonly machOPaths: readonly string[]
  readonly bundlePaths: readonly string[]
}

/** Electron Builder fields consumed without importing its incomplete declaration graph. */
export interface MacInternalAfterPackContext extends PackagedRuntimeContext {
  readonly packager: {
    readonly appInfo: {
      readonly productFilename: string
    }
  }
}

function pathDepth(path: string): number {
  return path.split(sep).length
}

function deepestFirst(left: string, right: string): number {
  return pathDepth(right) - pathDepth(left) || left.localeCompare(right)
}

function isMachO(path: string): boolean {
  const descriptor = openSync(path, 'r')
  try {
    const header = Buffer.alloc(4)
    if (readSync(descriptor, header, 0, header.length, 0) !== header.length) return false
    return MACH_O_MAGICS.has(header.readUInt32BE(0))
  } finally {
    closeSync(descriptor)
  }
}

/** Return every physical Mach-O file inside an application without following links. */
export function listMachOPaths(appPath: string): readonly string[] {
  const result: string[] = []
  const visit = (path: string): void => {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) return
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) visit(join(path, name))
      return
    }
    if (stat.isFile() && isMachO(path)) result.push(path)
  }
  visit(appPath)
  return result.sort(deepestFirst)
}

function listNestedCodeBundles(appPath: string): readonly string[] {
  const result: string[] = []
  const visit = (path: string): void => {
    const stat = lstatSync(path)
    if (!stat.isDirectory() || stat.isSymbolicLink()) return
    for (const name of readdirSync(path)) {
      const child = join(path, name)
      const childStat = lstatSync(child)
      if (!childStat.isDirectory() || childStat.isSymbolicLink()) continue
      visit(child)
      if (CODE_BUNDLE_EXTENSIONS.has(extname(child).toLowerCase())) result.push(child)
    }
  }
  visit(appPath)
  return result
    .filter(path => resolve(path) !== resolve(appPath))
    .sort(deepestFirst)
}

function run(command: string, args: readonly string[]): void {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`)
  }
}

/** Sign native files and nested bundles before sealing and strictly verifying the outer app. */
export function signMacInternalApp(options: MacInternalSignOptions): MacInternalSignResult {
  if (options.platform !== 'darwin') {
    throw new Error('internal macOS ad-hoc signing must run on a native macOS host')
  }
  const machOPaths = listMachOPaths(options.appPath)
  if (machOPaths.length === 0) {
    throw new Error(`internal macOS application contains no Mach-O code: ${options.appPath}`)
  }
  const nestedBundles = listNestedCodeBundles(options.appPath)
  const sign = (path: string): void => {
    options.run('codesign', ['--force', '--sign', '-', '--timestamp=none', path])
  }

  for (const path of machOPaths) sign(path)
  for (const path of nestedBundles) sign(path)
  sign(options.appPath)

  for (const path of machOPaths) {
    options.run('codesign', ['--verify', '--strict', '--verbose=2', path])
  }
  for (const path of nestedBundles) {
    options.run('codesign', ['--verify', '--strict', '--verbose=2', path])
  }
  options.run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', options.appPath])
  options.log(
    `Ad-hoc sealed ${String(machOPaths.length)} Mach-O files and ${String(nestedBundles.length)} nested bundles.`,
  )
  return { machOPaths, bundlePaths: [...nestedBundles, options.appPath] }
}

/** Electron Builder hook used only by the credential-free internal macOS build. */
export async function afterPack(context: MacInternalAfterPackContext): Promise<void> {
  await verifyPackagedRuntime(context)
  if (context.electronPlatformName !== 'darwin') {
    throw new Error(`internal macOS signing received ${JSON.stringify(context.electronPlatformName)}`)
  }
  const appPath = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  )
  signMacInternalApp({
    appPath,
    platform: process.platform,
    run,
    log: message => console.log(message),
  })
}

export default afterPack
