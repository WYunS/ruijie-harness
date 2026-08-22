import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RuijieAuthStore, type RuijieSecretProtection } from '../src/ruijie-auth-store.ts'

const temporaryPaths: string[] = []

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

function protection(available = true): RuijieSecretProtection {
  return {
    isEncryptionAvailable: () => available,
    encryptString: value => Buffer.from(`protected:${Buffer.from(value).toString('base64')}`),
    decryptString: value => Buffer.from(value.toString().replace(/^protected:/u, ''), 'base64').toString(),
  }
}

describe('Ruijie protected OAuth session store', () => {
  it('persists only an encrypted envelope and restores both OAuth tokens', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ruijie-auth-store-'))
    temporaryPaths.push(root)
    const store = new RuijieAuthStore(root, protection())
    const tokens = { accessToken: 'access-secret', refreshToken: 'refresh-secret' }

    await store.save(tokens)

    const source = await readFile(store.path, 'utf8')
    expect(source).not.toContain(tokens.accessToken)
    expect(source).not.toContain(tokens.refreshToken)
    expect(await store.load()).toEqual(tokens)
  })

  it('clears a corrupt protected session instead of repeatedly failing startup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ruijie-auth-store-'))
    temporaryPaths.push(root)
    const store = new RuijieAuthStore(root, protection())
    await store.save({ accessToken: 'access', refreshToken: 'refresh' })
    const broken = new RuijieAuthStore(root, {
      ...protection(),
      decryptString: () => { throw new Error('corrupt') },
    })

    expect(await broken.load()).toBeUndefined()
    expect(await store.load()).toBeUndefined()
  })

  it('never falls back to plaintext when OS encryption is unavailable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ruijie-auth-store-'))
    temporaryPaths.push(root)
    const store = new RuijieAuthStore(root, protection(false))

    await expect(store.save({ accessToken: 'access', refreshToken: 'refresh' })).rejects.toThrow('安全存储不可用')
    expect(await store.load()).toBeUndefined()
  })
})
