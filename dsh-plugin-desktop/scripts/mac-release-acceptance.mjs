/** Dynamic, release-specific macOS acceptance matrix generation. */

import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { buildMacAcceptancePlan } from './mac-installed-acceptance.ts'

function git(repoRoot, args, optional = false) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    if (optional) return undefined
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout || String(result.status)}`)
  }
  return result.stdout.trim()
}

function resolveBaseline(repoRoot, requested) {
  if (requested !== undefined && requested.trim() !== '') {
    git(repoRoot, ['rev-parse', '--verify', `${requested}^{commit}`])
    return { revision: requested, source: 'explicit' }
  }
  const tag = git(repoRoot, ['describe', '--tags', '--match', 'v[0-9]*', '--abbrev=0', 'HEAD^'], true)
  if (tag !== undefined && tag !== '') return { revision: tag, source: 'latest-version-tag' }
  const parent = git(repoRoot, ['rev-parse', '--verify', 'HEAD^'], true)
  if (parent !== undefined && parent !== '') return { revision: parent, source: 'previous-commit-fallback' }
  return { revision: git(repoRoot, ['rev-parse', 'HEAD']), source: 'initial-commit' }
}

function markdown(result) {
  const rows = result.plan.map(item => {
    const changed = item.changedFiles?.join('<br>') ?? ''
    return `| ${item.id} | ${item.mode} | ${item.title} | ${item.reasons.join('<br>')} | ${changed} |`
  }).join('\n')
  return `# macOS dynamic release acceptance plan

- Baseline: \`${result.baseline}\` (${result.baselineSource})
- Candidate: \`${result.head}\`
- Generated: ${result.generatedAt}
- Changed files: ${result.changedFiles.length}

The baseline rows are mandatory on every release. Diff-derived reasons add current-version and adjacent-risk coverage. A \`manual-blocking\` row must be mapped before release.

| Check | Mode | User-visible behavior | Why included | Unmapped files |
|---|---|---|---|---|
${rows}
`
}

export function generateMacReleaseAcceptancePlan({ repoRoot, evidenceDir, baseline }) {
  const resolvedBaseline = resolveBaseline(repoRoot, baseline)
  const head = git(repoRoot, ['rev-parse', 'HEAD'])
  const output = git(repoRoot, ['diff', '--name-only', `${resolvedBaseline.revision}..HEAD`])
  const changedFiles = output === '' ? [] : output.split(/\r?\n/u).filter(Boolean)
  const plan = buildMacAcceptancePlan(changedFiles)
  const result = {
    baseline: git(repoRoot, ['rev-parse', `${resolvedBaseline.revision}^{commit}`]),
    baselineSource: resolvedBaseline.source,
    head,
    generatedAt: new Date().toISOString(),
    changedFiles,
    plan,
  }
  mkdirSync(evidenceDir, { recursive: true })
  writeFileSync(resolve(evidenceDir, 'acceptance-plan.json'), `${JSON.stringify(result, null, 2)}\n`)
  writeFileSync(resolve(evidenceDir, 'ACCEPTANCE-PLAN.md'), markdown(result))
  return result
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const repoRoot = resolve(desktopRoot, '..')
  const evidenceDir = resolve(process.argv[2] ?? 'dist/mac-acceptance-plan')
  const result = generateMacReleaseAcceptancePlan({
    repoRoot,
    evidenceDir,
    baseline: process.argv[3] ?? process.env.DSH_MAC_ACCEPTANCE_BASELINE,
  })
  const blocking = result.plan.filter(item => item.mode === 'manual-blocking')
  process.stdout.write(`macOS acceptance plan: ${resolve(evidenceDir, 'ACCEPTANCE-PLAN.md')}\n`)
  if (blocking.length > 0) {
    process.stderr.write(`macOS acceptance plan has ${String(blocking.length)} blocking unmapped risk item(s).\n`)
    process.exitCode = 1
  }
}
