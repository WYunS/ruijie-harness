/** Verify the ad-hoc signed application structure sealed inside one macOS smoke DMG. */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MACOS_UNIVERSAL_NATIVE_ENTRIES } from './mac-universal.ts'
import { listMachOPaths } from './sign-mac-internal.ts'

/** Injectable filesystem and command boundaries for smoke verification. */
export interface MacSmokeVerificationOptions {
  /** Directory containing exactly one smoke DMG. */
  readonly distDir: string
  /** Installed application name inside the mounted image. */
  readonly productName: string
  /** Absolute purple RJ source used to validate every packaged icon layer. */
  readonly iconSource: string
  /** Absolute verifier for application and mounted-volume ICNS files. */
  readonly iconVerifier: string
  /** Node executable used to run the icon verifier. */
  readonly nodeExecutable: string
  /** Return regular DMG files in the distribution directory. */
  readonly listDmgs: (distDir: string) => readonly string[]
  /** Create a private empty mount point. */
  readonly makeMountPoint: () => string
  /** Execute one macOS verification command. */
  readonly run: (command: string, args: readonly string[]) => void
  /** Return every physical Mach-O path in the mounted application. */
  readonly listMachOPaths: (appPath: string) => readonly string[]
  /** Read codesign display output for the mounted outer application. */
  readonly readSignatureDetails: (appPath: string) => string
  /** Read the mounted outer application's designated requirement. */
  readonly readDesignatedRequirement: (appPath: string) => string
  /** Persist the signature audit beside the candidate DMG. */
  readonly writeSignatureAudit: (path: string, content: string) => void
  /** Remove the detached empty mount point. */
  readonly removeMountPoint: (mountPoint: string) => void
  /** Probe a physical path inside the mounted application. */
  readonly exists: (path: string) => boolean
  /** Report file metadata for a physical path inside the mounted application. */
  readonly stat: (path: string) => {
    readonly size: number
    readonly isFile: boolean
    readonly mode: number
  }
}

function listDmgs(distDir: string): readonly string[] {
  return readdirSync(distDir)
    .filter(name => name.endsWith('.dmg'))
    .map(name => join(distDir, name))
    .filter(path => statSync(path).isFile())
}

function run(command: string, args: readonly string[]): void {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`)
  }
}

function capture(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited with ${String(result.status)}: ${result.stderr || result.stdout}`,
    )
  }
  return `${result.stdout}${result.stderr}`.trim()
}

function defaultOptions(): MacSmokeVerificationOptions {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  return {
    distDir: process.argv[2] === undefined
      ? join(packageRoot, 'dist', 'mac-internal')
      : resolve(process.argv[2]),
    productName: '锐捷 Harness',
    iconSource: join(packageRoot, 'build', 'app-icon-mac.png'),
    iconVerifier: fileURLToPath(new URL('./verify-mac-app-icon.mjs', import.meta.url)),
    nodeExecutable: process.execPath,
    listDmgs,
    makeMountPoint: () => mkdtempSync(join(tmpdir(), 'dsh-desktop-dmg-smoke-')),
    run,
    listMachOPaths,
    readSignatureDetails: appPath => capture('codesign', ['-dv', '--verbose=4', appPath]),
    readDesignatedRequirement: appPath => capture('codesign', ['-dr', '-', appPath]),
    writeSignatureAudit: (path, content) => writeFileSync(path, content, 'utf8'),
    removeMountPoint: mountPoint => rmdirSync(mountPoint),
    exists: existsSync,
    stat: path => {
      const result = statSync(path)
      return { size: result.size, isFile: result.isFile(), mode: result.mode }
    },
  }
}

/**
 * Mount and verify the application structure and complete ad-hoc signature of
 * the unique internal DMG. Gatekeeper and stapler remain Developer ID release checks.
 * @param options - Filesystem and command boundaries.
 * @returns The verified DMG and application paths.
 */
export function verifyMacSmoke(
  options: MacSmokeVerificationOptions = defaultOptions(),
): { readonly appPath: string; readonly dmgPath: string } {
  const dmgs = options.listDmgs(options.distDir)
  if (dmgs.length !== 1) {
    throw new Error(
      `macOS DMG smoke verification requires exactly one DMG in ${options.distDir}; found ${String(dmgs.length)}`,
    )
  }

  const dmgPath = dmgs[0]!
  const mountPoint = options.makeMountPoint()
  const appPath = join(mountPoint, `${options.productName}.app`)
  let mounted = false
  let failure: unknown

  try {
    options.run('hdiutil', ['attach', dmgPath, '-mountpoint', mountPoint, '-nobrowse', '-readonly'])
    mounted = true

    const infoPlistPath = join(appPath, 'Contents', 'Info.plist')
    if (!options.exists(infoPlistPath)) {
      throw new Error(`packaged application is missing ${infoPlistPath}`)
    }
    options.run('plutil', ['-lint', infoPlistPath])

    const macosDirectory = join(appPath, 'Contents', 'MacOS')
    if (!options.exists(macosDirectory)) {
      throw new Error(`packaged application is missing ${macosDirectory}`)
    }
    const executablePath = join(macosDirectory, options.productName)
    if (!options.exists(executablePath)) {
      throw new Error(`packaged application is missing its main executable: ${executablePath}`)
    }
    const executableStat = options.stat(executablePath)
    if (
      !executableStat.isFile
      || executableStat.size === 0
      || (executableStat.mode & 0o111) === 0
    ) {
      throw new Error(`packaged application has an invalid main executable: ${executablePath}`)
    }
    options.run('lipo', [executablePath, '-verify_arch', 'x86_64'])
    options.run('lipo', [executablePath, '-verify_arch', 'arm64'])

    const appAsarPath = join(appPath, 'Contents', 'Resources', 'app.asar')
    if (!options.exists(appAsarPath)) {
      throw new Error(`packaged application is missing ${appAsarPath}`)
    }
    const appAsarStat = options.stat(appAsarPath)
    if (!appAsarStat.isFile || appAsarStat.size === 0) {
      throw new Error(`packaged application archive is empty: ${appAsarPath}`)
    }

    options.run(options.nodeExecutable, [
      options.iconVerifier,
      options.iconSource,
      join(appPath, 'Contents', 'Resources', 'icon.icns'),
      join(mountPoint, '.VolumeIcon.icns'),
    ])

    const unpackedRoot = `${appAsarPath}.unpacked`
    for (const entry of MACOS_UNIVERSAL_NATIVE_ENTRIES) {
      const nativePath = join(unpackedRoot, entry.path)
      if (!options.exists(nativePath)) {
        throw new Error(`universal application is missing ${nativePath}`)
      }
      const nativeStat = options.stat(nativePath)
      if (!nativeStat.isFile || nativeStat.size === 0) {
        throw new Error(`universal application has an invalid native file: ${nativePath}`)
      }
      if (entry.path.endsWith('/spawn-helper') && (nativeStat.mode & 0o111) === 0) {
        throw new Error(`universal application has a non-executable node-pty helper: ${nativePath}`)
      }
      options.run('lipo', [nativePath, '-verify_arch', entry.arch])
    }

    const machOPaths = options.listMachOPaths(appPath)
    if (machOPaths.length === 0) {
      throw new Error(`packaged application contains no Mach-O code: ${appPath}`)
    }
    for (const codePath of machOPaths) {
      options.run('codesign', ['--verify', '--strict', '--verbose=2', codePath])
    }
    options.run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])

    const signatureDetails = options.readSignatureDetails(appPath)
    if (!/^Signature=adhoc$/mu.test(signatureDetails)) {
      throw new Error(`packaged application does not have the required ad-hoc signature:\n${signatureDetails}`)
    }
    if (!/^Identifier=cn\.com\.ruijie\.dsh\.desktop$/mu.test(signatureDetails)) {
      throw new Error(`packaged application has the wrong signing identifier:\n${signatureDetails}`)
    }
    if (!/^TeamIdentifier=not set$/mu.test(signatureDetails)) {
      throw new Error(`packaged ad-hoc application unexpectedly has a team identity:\n${signatureDetails}`)
    }
    const designatedRequirement = options.readDesignatedRequirement(appPath)
    if (!/designated\s*=>/u.test(designatedRequirement)) {
      throw new Error(`packaged application has no designated requirement:\n${designatedRequirement}`)
    }
    const audit = [
      `dmg=${basename(dmgPath)}`,
      `bundle_id=cn.com.ruijie.dsh.desktop`,
      'signing=ad-hoc',
      'notarization=disabled',
      `mach_o_count=${String(machOPaths.length)}`,
      '',
      '[codesign-details]',
      signatureDetails,
      '',
      '[designated-requirement]',
      designatedRequirement,
      '',
      '[verified-mach-o]',
      ...machOPaths.map(path => path.slice(appPath.length + 1)),
      '',
    ].join('\n')
    options.writeSignatureAudit(join(options.distDir, 'SIGNATURE-AUDIT.txt'), audit)
  } catch (cause) {
    failure = cause
  }

  const cleanupFailures: unknown[] = []
  if (mounted) {
    try {
      options.run('hdiutil', ['detach', mountPoint])
    } catch (cause) {
      cleanupFailures.push(cause)
    }
  }
  try {
    options.removeMountPoint(mountPoint)
  } catch (cause) {
    cleanupFailures.push(cause)
  }

  if (failure !== undefined || cleanupFailures.length > 0) {
    const failures = failure === undefined ? cleanupFailures : [failure, ...cleanupFailures]
    throw new AggregateError(failures, `failed to verify macOS smoke DMG ${basename(dmgPath)}`)
  }
  return { appPath, dmgPath }
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    const verified = verifyMacSmoke()
    console.log(`macOS DMG smoke verification passed: ${verified.dmgPath}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    if (error instanceof AggregateError) {
      for (const inner of error.errors) {
        console.error(`  ${inner instanceof Error ? inner.message : String(inner)}`)
      }
    }
    process.exitCode = 1
  }
}
