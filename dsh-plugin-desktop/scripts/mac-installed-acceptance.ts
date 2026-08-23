import { join } from 'node:path'

export interface InstalledWorkbenchSnapshot {
  readonly url: string
  readonly bodyText: string
}

export type MacAcceptanceMode = 'automated' | 'manual-required' | 'manual-blocking'

export interface MacAcceptancePlanItem {
  readonly id: string
  readonly title: string
  readonly mode: MacAcceptanceMode
  readonly reasons: readonly string[]
  readonly changedFiles?: readonly string[]
}

const BASELINE: readonly Omit<MacAcceptancePlanItem, 'reasons'>[] = [
  { id: 'install-and-first-launch', title: 'Install the DMG copy and reach the real workbench', mode: 'automated' },
  { id: 'onboarding-absent', title: 'Obsolete onboarding stays absent', mode: 'automated' },
  { id: 'protected-login', title: 'Complete protected OAuth login', mode: 'automated' },
  { id: 'workspace-and-session', title: 'Choose a workspace and create a session', mode: 'automated' },
  { id: 'model-and-reasoning', title: 'Show the default model and reasoning strength controls', mode: 'automated' },
  { id: 'language-persistence', title: 'Change language through the UI and persist the preference', mode: 'automated' },
  { id: 'sidebar-controls', title: 'Collapse, expand, close, and restore a sidebar tab', mode: 'automated' },
  { id: 'office-pdf-image', title: 'Open Word, Excel, PowerPoint, PDF, and image fixtures', mode: 'automated' },
  { id: 'browser-navigation', title: 'Open the built-in browser and navigate a real guest page', mode: 'automated' },
  { id: 'restart-persistence', title: 'Restart with login, settings, workspace, and session state preserved', mode: 'automated' },
  { id: 'real-model-document-understanding', title: 'Use the real company model to understand image, Word, Excel, PowerPoint, and PDF content', mode: 'manual-required' },
  { id: 'real-web-search-and-network', title: 'Use real WebSearch through the target company network', mode: 'manual-required' },
]

interface RiskRule {
  readonly risk: string
  readonly pattern: RegExp
  readonly checks: readonly string[]
  readonly adjacent?: Readonly<Record<string, string>>
}

const RISK_RULES: readonly RiskRule[] = [
  {
    risk: 'sidebar',
    pattern: /(?:^|\/)(?:dsh-better-sidebar|sidebar)(?:\/|\.|$)/iu,
    checks: ['sidebar-controls'],
    adjacent: { 'office-pdf-image': 'adjacent:sidebar', 'browser-navigation': 'adjacent:sidebar' },
  },
  {
    risk: 'auth',
    pattern: /(?:auth|oauth|login|credential|safe-storage|safe_storage)/iu,
    checks: ['protected-login'],
    adjacent: { 'restart-persistence': 'adjacent:auth' },
  },
  {
    risk: 'model',
    pattern: /(?:model|reasoning|agent-preset)/iu,
    checks: ['model-and-reasoning'],
    adjacent: { 'restart-persistence': 'adjacent:model' },
  },
  {
    risk: 'locale',
    pattern: /(?:locale|language|settings-general)/iu,
    checks: ['language-persistence'],
    adjacent: { 'restart-persistence': 'adjacent:locale' },
  },
  {
    risk: 'documents',
    pattern: /(?:office|docx|xlsx|pptx|pdf|attachment|image|ocr|tessdata)/iu,
    checks: ['office-pdf-image'],
  },
  {
    risk: 'browser',
    pattern: /(?:browser|webview|web[-_]?search)/iu,
    checks: ['browser-navigation'],
  },
  {
    risk: 'workspace',
    pattern: /(?:workspace|session|conversation)/iu,
    checks: ['workspace-and-session'],
    adjacent: { 'restart-persistence': 'adjacent:workspace' },
  },
  {
    risk: 'packaging',
    pattern: /(?:package-mac|mac-universal|electron|window-options|\.github\/workflows\/macos)/iu,
    checks: ['install-and-first-launch'],
  },
]

function normalized(path: string): string {
  return path.replaceAll('\\', '/')
}

function isRuntimeChange(path: string): boolean {
  return /^(?:dsh-plugin-desktop\/src\/|dsh-plugin-desktop\/vendor\/|vendor\/|deepseek-harness$)/u.test(path)
}

/** Settings are owned by the shared settings provider at the DSH_HOME root. */
export function installedSettingsPath(dshHome: string): string {
  return join(dshHome, 'settings.yaml')
}

/**
 * Build the per-release acceptance matrix from Git changes while retaining
 * the non-negotiable installed-app regression baseline.
 */
export function buildMacAcceptancePlan(changedFiles: readonly string[]): MacAcceptancePlanItem[] {
  const plan = BASELINE.map(item => ({ ...item, reasons: ['baseline'] }))
  const byId = new Map(plan.map(item => [item.id, item]))
  const unmapped: string[] = []

  for (const rawPath of changedFiles) {
    const path = normalized(rawPath)
    const matching = RISK_RULES.filter(rule => rule.pattern.test(path))
    if (matching.length === 0) {
      if (isRuntimeChange(path)) unmapped.push(path)
      continue
    }
    for (const rule of matching) {
      for (const id of rule.checks) {
        const item = byId.get(id)
        if (item !== undefined) item.reasons = [...item.reasons, `changed:${rule.risk}`, `changed:${path}`]
      }
      for (const [id, reason] of Object.entries(rule.adjacent ?? {})) {
        const item = byId.get(id)
        if (item !== undefined) item.reasons = [...item.reasons, reason]
      }
    }
  }

  for (const item of plan) item.reasons = [...new Set(item.reasons)]
  if (unmapped.length > 0) {
    plan.push({
      id: 'unmapped-runtime-review',
      title: 'Map every changed runtime surface to an explicit acceptance case',
      mode: 'manual-blocking',
      reasons: ['unmapped-runtime-change'],
      changedFiles: unmapped,
    })
  }
  return plan
}

export function isInstalledWorkbenchReady(
  snapshot: InstalledWorkbenchSnapshot,
  issuerOrigin: string,
): boolean {
  let pageUrl: URL
  let issuerUrl: URL
  try {
    pageUrl = new URL(snapshot.url)
    issuerUrl = new URL(issuerOrigin)
  } catch {
    return false
  }

  if (pageUrl.protocol !== 'http:' || pageUrl.hostname !== '127.0.0.1') return false
  if (pageUrl.origin === issuerUrl.origin) return false

  const bodyText = snapshot.bodyText.trim()
  if (bodyText.length === 0) return false
  return !/loading\s+plugins(?:\.{3}|…)?/iu.test(bodyText)
}
