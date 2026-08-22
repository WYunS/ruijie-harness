/** Windows-protected persistence for the Ruijie OAuth session. */

import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { RuijieOAuthTokens } from './ruijie-auth.ts'

interface StoredEnvelope {
  readonly version: 1
  readonly ciphertext: string
}

export interface RuijieSecretProtection {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

/** Stores no OAuth material unless Electron can encrypt it with the OS credential service. */
export class RuijieAuthStore {
  readonly path: string

  constructor(userDataPath: string, private readonly protection: RuijieSecretProtection) {
    this.path = join(userDataPath, 'ruijie-auth', 'oauth-session.enc')
  }

  async load(): Promise<RuijieOAuthTokens | undefined> {
    if (!this.protection.isEncryptionAvailable()) return undefined
    let source: string
    try {
      source = await readFile(this.path, 'utf8')
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw cause
    }
    try {
      const envelope = JSON.parse(source) as Partial<StoredEnvelope>
      if (envelope.version !== 1 || typeof envelope.ciphertext !== 'string') throw new Error('invalid envelope')
      const plaintext = this.protection.decryptString(Buffer.from(envelope.ciphertext, 'base64'))
      const tokens = JSON.parse(plaintext) as Partial<RuijieOAuthTokens>
      if (typeof tokens.accessToken !== 'string' || tokens.accessToken.length === 0
        || typeof tokens.refreshToken !== 'string' || tokens.refreshToken.length === 0) {
        throw new Error('invalid OAuth session')
      }
      return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
    } catch {
      await this.clear()
      return undefined
    }
  }

  async save(tokens: RuijieOAuthTokens): Promise<void> {
    if (!this.protection.isEncryptionAvailable()) {
      throw new Error('Windows 安全存储不可用，无法安全保存登录状态。')
    }
    const ciphertext = this.protection.encryptString(JSON.stringify(tokens)).toString('base64')
    const envelope: StoredEnvelope = { version: 1, ciphertext }
    await writeFileAtomic(this.path, `${JSON.stringify(envelope)}\n`, { mode: 0o600, dirMode: 0o700 })
  }

  async clear(): Promise<void> {
    await rm(this.path, { force: true })
  }
}
