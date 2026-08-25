import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../src/client/ruijie-account-card.tsx', import.meta.url), 'utf8')

describe('Ruijie account sidebar presentation', () => {
  it('gives the account card its own footer row instead of sharing the market row', () => {
    expect(source).toMatch(/:has\(> \.ruijieAccountSeat\)[^{]*\{[^}]*flex-direction:\s*column/su)
  })

  it('uses a compact balance in the sidebar while retaining exact money in the popover', () => {
    expect(source).toContain('compactMoney(summary?.billing.remaining ?? 0)')
    expect(source).toContain('<dd>{money(summary.billing.remaining)}</dd>')
  })

  it('labels wallet values as Renminbi rather than US dollars', () => {
    expect(source).toContain("currency: 'CNY'")
    expect(source).not.toMatch(/currency:\s*'USD'|US\$/u)
  })

  it('closes the quota popover when the user clicks outside it', () => {
    expect(source).toContain("document.addEventListener('pointerdown', closeOnOutsidePointer, true)")
    expect(source).toContain('!seatRef.current?.contains(event.target)')
  })

  it('uses RJ initials instead of the upstream whale', () => {
    expect(source).toContain('>RJ</span>')
    expect(source).not.toMatch(/Whale|favicon\.svg/u)
  })

  it('keeps both account quota and IM robot usable in the collapsed rail', () => {
    expect(source).toContain('function collapsedAccountLabel')
    expect(source).toContain('{collapsedAccountLabel(label)}')
    expect(source).toContain('className="ruijieAccountCollapsedLabel"')
    expect(source).toContain('<RobotMark />')
    expect(source).toMatch(/\.ruijieAccountSeat\s*\{[^}]*width:\s*36px/su)
    expect(source).toMatch(/\.ruijieAccountSeat\[data-wide\]\s*\{[^}]*width:\s*100%/su)
  })

  it('removes the clipped community-market sliver from the sidebar footer', () => {
    expect(source).toContain('.dshMarketLauncher { display: none !important; }')
  })

  it('refreshes quota once per minute and when the window regains focus', () => {
    expect(source).toContain('const REFRESH_INTERVAL_MS = 60_000')
    expect(source).toContain("window.addEventListener('focus', onFocus)")
  })

  it('requires an explicit user action before clearing the reusable SSO session', () => {
    expect(source).toContain("window.confirm('退出锐捷 Harness？下次打开时需要重新授权。')")
    expect(source).toContain('RUIJIE_LOGOUT_PATH')
    expect(source).toContain("method: 'POST'")
    expect(source).toContain("'退出登录'")
  })
})
