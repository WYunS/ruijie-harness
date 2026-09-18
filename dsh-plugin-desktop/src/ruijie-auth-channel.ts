import { createReadStream, createWriteStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type { RuijieOAuthCredentialStore, RuijieOAuthTokens } from './ruijie-auth.ts'

const MAX_TOKEN_LENGTH = 16 * 1024

function descriptor(value: string | undefined): number | undefined {
  if (value === undefined || !/^[3-9][0-9]*$/u.test(value)) return undefined
  const result = Number(value)
  return Number.isSafeInteger(result) ? result : undefined
}

function tokensOf(value: unknown): RuijieOAuthTokens | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const candidate = value as Partial<RuijieOAuthTokens> & { type?: unknown }
  if (candidate.type !== 'session'
    || typeof candidate.accessToken !== 'string' || candidate.accessToken.length === 0 || candidate.accessToken.length > MAX_TOKEN_LENGTH
    || typeof candidate.refreshToken !== 'string' || candidate.refreshToken.length === 0 || candidate.refreshToken.length > MAX_TOKEN_LENGTH) return undefined
  return { accessToken: candidate.accessToken, refreshToken: candidate.refreshToken }
}

export interface RuijieAuthChannel {
  readonly credentialStore: RuijieOAuthCredentialStore
  close(): void
}

/** A private inherited pipe keeps OAuth material out of argv, environment and disk. */
export function createInheritedRuijieAuthChannel(
  environment: NodeJS.ProcessEnv,
  onInvalidated: () => void,
): RuijieAuthChannel | undefined {
  const inputFd = descriptor(environment.RUIJIE_DSH_AUTH_INPUT_FD)
  const outputFd = descriptor(environment.RUIJIE_DSH_AUTH_OUTPUT_FD)
  if (inputFd === undefined && outputFd === undefined) return undefined
  if (inputFd === undefined || outputFd === undefined || inputFd === outputFd) {
    throw new Error('dsh-plugin-desktop: invalid inherited authentication channel')
  }
  const input = createReadStream('', { fd: inputFd, autoClose: false, encoding: 'utf8' })
  const output = createWriteStream('', { fd: outputFd, autoClose: false, encoding: 'utf8' })
  const lines = createInterface({ input, crlfDelay: Infinity })
  let current: RuijieOAuthTokens | undefined
  let loaded = false
  let settled = false
  let resolveInitial!: (tokens: RuijieOAuthTokens | undefined) => void
  const initial = new Promise<RuijieOAuthTokens | undefined>((resolve) => { resolveInitial = resolve })
  const settle = (tokens: RuijieOAuthTokens | undefined) => {
    if (settled) return
    settled = true
    resolveInitial(tokens)
  }
  const invalidate = () => {
    current = undefined
    settle(undefined)
    if (loaded) onInvalidated()
  }
  lines.on('line', (line) => {
    if (Buffer.byteLength(line) > MAX_TOKEN_LENGTH * 2 + 256) return invalidate()
    let value: unknown
    try { value = JSON.parse(line) } catch { return invalidate() }
    if ((value as { type?: unknown })?.type === 'clear') return invalidate()
    const next = tokensOf(value)
    if (next === undefined) return invalidate()
    if (loaded && (next.accessToken !== current?.accessToken || next.refreshToken !== current?.refreshToken)) {
      current = next
      onInvalidated()
      return
    }
    current = next
    settle(next)
  })
  lines.once('close', invalidate)
  input.once('error', invalidate)
  const send = (value: object) => {
    if (!output.destroyed) output.write(`${JSON.stringify(value)}\n`)
  }
  return {
    credentialStore: {
      async load() {
        const tokens = await initial
        loaded = true
        return tokens
      },
      async save(tokens) {
        current = tokens
        send({ type: 'save', ...tokens })
      },
      async clear() {
        current = undefined
        send({ type: 'clear' })
      },
    },
    close() {
      lines.close()
      input.destroy()
      output.end()
    },
  }
}
