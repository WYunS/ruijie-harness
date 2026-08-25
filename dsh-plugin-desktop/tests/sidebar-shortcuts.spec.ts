import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findExactButton } from '../src/client/sidebar-shortcuts.tsx'

const source = readFileSync(new URL('../src/client/sidebar-shortcuts.tsx', import.meta.url), 'utf8')
const accountSource = readFileSync(new URL('../src/client/ruijie-account-card.tsx', import.meta.url), 'utf8')

describe('sidebar shortcuts', () => {
  it('finds an icon-only collapsed Settings button by its accessible label', () => {
    const settings = {
      textContent: '',
      getAttribute: (name: string) => name === 'aria-label' ? '设置' : null,
    } as HTMLButtonElement
    const root = {
      querySelectorAll: () => [settings],
    } as unknown as ParentNode

    expect(findExactButton('设置', root)).toBe(settings)
  })

  it('finds the collapsed Settings button through its stable settings slot', () => {
    const settings = { textContent: '', getAttribute: () => null } as unknown as HTMLButtonElement
    const settingsSlot = { closest: () => settings }
    const root = {
      querySelectorAll: () => [],
      querySelector: (selector: string) => selector === '[data-slot="settings.trigger"]' ? settingsSlot : null,
    } as unknown as ParentNode

    expect(findExactButton('设置', root)).toBe(settings)
  })

  it('places one IM entry after the account and immediately above Settings', () => {
    expect(accountSource).toContain('className="ruijieImShortcut"')
    expect(accountSource).toContain('onClick={openImSettings}')
    expect(accountSource.indexOf('className="ruijieAccountTrigger"')).toBeLessThan(accountSource.indexOf('className="ruijieImShortcut"'))
    expect(accountSource).not.toContain('installSidebarShortcuts')
    expect(source).not.toContain('MutationObserver')
    expect(source).not.toContain('个性化外观')
    expect(accountSource).toContain('color: var(--dsw-alias-label-primary)')
    expect(accountSource).toContain('width: calc(100% + 9px)')
    expect(accountSource).toContain('margin: 0 -2px')
    expect(accountSource).toContain('padding: 0 10px 0 8px')
    expect(accountSource).toContain('font-size: 14px')
    expect(accountSource).toContain('line-height: 22px')
    expect(accountSource).toContain('transform: translateX(-5px)')
    expect(accountSource).toContain('width="20" height="20"')
  })

  it('opens settings only after the user explicitly clicks a shortcut', () => {
    expect(accountSource).toContain('aria-label="IM机器人"')
    expect(source).toContain("awaitExactButton('插件', dialog")
    expect(source).toContain("awaitExactButton('IM机器人', dialog")
    expect(source).toContain("candidate.textContent?.trim() === label")
    expect(source).toContain("findExactButton('设置', document)")
    expect(source).not.toContain('useEffect(() => { openImSettings')
  })
})
