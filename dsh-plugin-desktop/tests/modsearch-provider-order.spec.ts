import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface DoctorReport {
  roles: Array<{
    role: string
    candidates: Array<{ engine: string }>
  }>
}

describe('desktop ModSearch provider order', () => {
  it('keeps paid search adapters ahead of Firecrawl and reads pages locally first', () => {
    const cli = resolve('node_modules/@liustack/modsearch/dist/main.js')
    const report = JSON.parse(execFileSync(process.execPath, [cli, 'doctor', '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        EXA_API_KEY: 'test-exa-key',
        TAVILY_API_KEY: 'test-tavily-key',
        FIRECRAWL_API_KEY: 'test-firecrawl-key',
      },
    })) as DoctorReport

    const search = report.roles.find(role => role.role === 'search')
    const fetch = report.roles.find(role => role.role === 'fetch')
    expect(search?.candidates.map(candidate => candidate.engine)).toEqual([
      'exa', 'tavily', 'antigravity-cli', 'firecrawl',
    ])
    expect(fetch?.candidates.map(candidate => candidate.engine)).toEqual([
      'local', 'antigravity-cli', 'firecrawl',
    ])
  })
})
