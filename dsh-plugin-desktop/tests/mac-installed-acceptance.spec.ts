import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildMacAcceptancePlan,
  installedSettingsPath,
  isInstalledWorkbenchReady,
} from '../scripts/mac-installed-acceptance.ts'

describe('installed macOS workbench readiness', () => {
  it('does not treat the transient plugin loading page as ready', () => {
    expect(isInstalledWorkbenchReady({
      url: 'http://127.0.0.1:49346/?dsh-desktop-platform=darwin',
      bodyText: 'HARNESS\nLoading plugins…',
    }, 'http://127.0.0.1:49100')).toBe(false)
  })

  it('accepts a rendered loopback workbench from a different port than the mock issuer', () => {
    expect(isInstalledWorkbenchReady({
      url: 'http://127.0.0.1:49346/?dsh-desktop-platform=darwin',
      bodyText: 'New task\nFiles\nSettings',
    }, 'http://127.0.0.1:49100')).toBe(true)
  })

  it('rejects empty, non-loopback, and mock-issuer pages', () => {
    expect(isInstalledWorkbenchReady({ url: 'about:blank', bodyText: '' }, 'http://127.0.0.1:49100')).toBe(false)
    expect(isInstalledWorkbenchReady({ url: 'https://example.com', bodyText: 'ready' }, 'http://127.0.0.1:49100')).toBe(false)
    expect(isInstalledWorkbenchReady({ url: 'http://127.0.0.1:49100/status', bodyText: 'ready' }, 'http://127.0.0.1:49100')).toBe(false)
  })
})

describe('installed macOS acceptance paths', () => {
  it('checks the settings file at the DSH_HOME root', () => {
    expect(installedSettingsPath('/tmp/isolated-dsh-home')).toBe(join('/tmp/isolated-dsh-home', 'settings.yaml'))
  })

  it('collapses the right sidebar before opening Settings for language selection', () => {
    const verifier = readFileSync(new URL('../scripts/verify-mac-installed-app.mjs', import.meta.url), 'utf8')
    const firstLaunch = verifier.slice(
      verifier.indexOf('async function exerciseFirstLaunch'),
      verifier.indexOf('async function verifyRestartedExperience'),
    )
    expect(firstLaunch.indexOf('await collapseRightSidebar(page)')).toBeGreaterThanOrEqual(0)
    expect(firstLaunch.indexOf('await collapseRightSidebar(page)'))
      .toBeLessThan(firstLaunch.indexOf('await switchLanguageToChinese(page)'))
  })
})

describe('dynamic macOS release acceptance plan', () => {
  it('always retains the human-like installed-app regression baseline', () => {
    const plan = buildMacAcceptancePlan([])
    expect(plan.map(item => item.id)).toEqual(expect.arrayContaining([
      'install-and-first-launch',
      'onboarding-absent',
      'workspace-and-session',
      'model-and-reasoning',
      'language-persistence',
      'sidebar-controls',
      'office-pdf-image',
      'browser-navigation',
      'restart-persistence',
      'real-model-document-understanding',
      'real-web-search-and-network',
    ]))
    expect(plan.find(item => item.id === 'real-model-document-understanding')?.mode).toBe('manual-required')
  })

  it('adds adjacent sidebar risks from a sidebar change without duplicating the baseline', () => {
    const plan = buildMacAcceptancePlan(['vendor/dsh-better-sidebar/src/client/Sidebar.tsx'])
    const sidebar = plan.find(item => item.id === 'sidebar-controls')
    const documents = plan.find(item => item.id === 'office-pdf-image')
    const browser = plan.find(item => item.id === 'browser-navigation')
    expect(sidebar?.reasons).toContain('changed:vendor/dsh-better-sidebar/src/client/Sidebar.tsx')
    expect(documents?.reasons).toContain('adjacent:sidebar')
    expect(browser?.reasons).toContain('adjacent:sidebar')
    expect(new Set(plan.map(item => item.id)).size).toBe(plan.length)
  })

  it('adds login and restart coverage for auth changes', () => {
    const plan = buildMacAcceptancePlan(['dsh-plugin-desktop/src/ruijie-auth.ts'])
    expect(plan.find(item => item.id === 'protected-login')?.reasons).toContain('changed:auth')
    expect(plan.find(item => item.id === 'restart-persistence')?.reasons).toContain('adjacent:auth')
  })

  it('marks an unmapped runtime change as a blocking manual review', () => {
    const plan = buildMacAcceptancePlan(['dsh-plugin-desktop/src/new-runtime-surface.ts'])
    expect(plan).toContainEqual(expect.objectContaining({
      id: 'unmapped-runtime-review',
      mode: 'manual-blocking',
      changedFiles: ['dsh-plugin-desktop/src/new-runtime-surface.ts'],
    }))
  })

  it('does not block on documentation-only changes', () => {
    const plan = buildMacAcceptancePlan(['发布交付指南/02-macOS打包指导.md'])
    expect(plan.some(item => item.id === 'unmapped-runtime-review')).toBe(false)
  })
})
