/** Launch the local Windows desktop build with the built-in Ruijie SSO flow. */

import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32') {
  throw new Error('锐捷 Harness 本地启动器当前只支持 Windows。')
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const localDataRoot = resolve(root, '.local-data')
const dshHome = resolve(localDataRoot, 'dsh-home')
const electronUserData = resolve(localDataRoot, 'electron-user-data')

await Promise.all([
  mkdir(dshHome, { recursive: true }),
  mkdir(electronUserData, { recursive: true }),
])

const corepackYarn = resolve(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'yarn.js')
await access(corepackYarn)
const child = spawn(process.execPath, [corepackYarn, 'dev'], {
  cwd: root,
  env: {
    ...process.env,
    DSH_HOME: dshHome,
    RUIJIE_DSH_USER_DATA_DIR: electronUserData,
  },
  stdio: 'inherit',
  windowsHide: false,
})

const exitCode = await new Promise((resolveExit, rejectExit) => {
  child.once('error', rejectExit)
  child.once('exit', code => { resolveExit(code ?? 1) })
})
process.exitCode = exitCode
