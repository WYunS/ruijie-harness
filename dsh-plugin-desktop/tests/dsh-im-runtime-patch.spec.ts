import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

describe('DSH-IM packaged runtime compatibility', () => {
  it('passes the desktop proxy to WhatsApp and returns a valid DSH error envelope', () => {
    const packagePath = require.resolve('@xmanrui/dsh-im/package.json')
    const runtimePath = new URL('./lib/index.js', `file:///${packagePath.replaceAll('\\', '/')}`)
    const source = readFileSync(runtimePath, 'utf8')

    expect(source).toContain('process.env.HTTPS_PROXY')
    expect(source).toContain("import { HttpsProxyAgent as __dshHttpsProxyAgent } from 'https-proxy-agent'")
    expect(source).toContain('new __dshHttpsProxyAgent(H)')
    expect(source).toContain('agent:E,fetchAgent:E')
    expect(source).not.toContain('new JM(')
    expect(source).toContain('{code:"internal",message:')
    expect(source).toContain('details:{}}')
    expect(source).not.toContain('{code:"whatsapp-operation-failed",message:')
  })

  it('runs the compatibility patch before every build', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      scripts: { build: string }
      dependencies: Record<string, string>
    }
    expect(manifest.scripts.build).toMatch(/^node scripts\/patch-dsh-im-runtime\.mjs &&/)
    expect(manifest.dependencies['https-proxy-agent']).toBe('7.0.6')
  })

  it('reports returned IM files as clickable produced files', () => {
    const packagePath = require.resolve('@xmanrui/dsh-im/package.json')
    const runtimePath = new URL('./lib/index.js', `file:///${packagePath.replaceAll('\\', '/')}`)
    const source = readFileSync(runtimePath, 'utf8')

    expect(source).toContain(
      'presentCall:A=>({card:"generic",kind:"edit",title:"Deliver file",locations:[{path:A.path}]})',
    )
  })
})
