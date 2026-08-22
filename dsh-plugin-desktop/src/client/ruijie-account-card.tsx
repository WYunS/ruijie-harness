import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  RUIJIE_ACCOUNT_CLIENT_HEADER,
  RUIJIE_ACCOUNT_CLIENT_VALUE,
  RUIJIE_ACCOUNT_PATH,
  RUIJIE_LOGOUT_PATH,
  type RuijieAccountSummary,
} from '../ruijie-account-contract.ts'

const REFRESH_INTERVAL_MS = 60_000

function isSummary(value: unknown): value is RuijieAccountSummary {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Partial<RuijieAccountSummary>
  return candidate.authentication === 'sso'
    && candidate.account !== undefined
    && candidate.billing !== undefined
    && typeof candidate.billing.remaining === 'number'
    && typeof candidate.billing.total === 'number'
    && typeof candidate.billing.used === 'number'
}

function money(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function compactMoney(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 2,
  }).format(value)
}

function accountLabel(summary: RuijieAccountSummary | undefined): string {
  if (summary === undefined) return '锐捷账号'
  return summary.account.name ?? summary.account.email?.split('@')[0] ?? '锐捷账号'
}

function RuijieMark({ size }: { size: number }) {
  return <span className="ruijieMarkInitials" style={{ fontSize: Math.max(8, size * 0.43) }} aria-hidden="true">RJ</span>
}

type AccountCardProps = PropsRuntime<'sidebar.footer.action'>

/** Compact SSO wallet entry at the bottom of the official Harness sidebar. */
export function RuijieAccountCard({ wide }: AccountCardProps) {
  const seatRef = useRef<HTMLDivElement>(null)
  const [summary, setSummary] = useState<RuijieAccountSummary>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const response = await fetch(RUIJIE_ACCOUNT_PATH, {
        headers: { [RUIJIE_ACCOUNT_CLIENT_HEADER]: RUIJIE_ACCOUNT_CLIENT_VALUE },
        cache: 'no-store',
        ...(signal === undefined ? {} : { signal }),
      })
      const payload = await response.json() as unknown
      if (!response.ok || !isSummary(payload)) throw new Error('无法读取账号额度')
      setSummary(payload)
      setError(undefined)
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError(cause instanceof Error ? cause.message : '无法读取账号额度')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    if (!window.confirm('退出锐捷 Harness？下次打开时需要重新授权。')) return
    setLoggingOut(true)
    try {
      const response = await fetch(RUIJIE_LOGOUT_PATH, {
        method: 'POST',
        headers: { [RUIJIE_ACCOUNT_CLIENT_HEADER]: RUIJIE_ACCOUNT_CLIENT_VALUE },
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('无法退出锐捷账号')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法退出锐捷账号')
      setLoggingOut(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    const interval = window.setInterval(() => { void refresh() }, REFRESH_INTERVAL_MS)
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => {
      controller.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !seatRef.current?.contains(event.target)) setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOnOutsidePointer, true)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true)
    }
  }, [open])

  const label = accountLabel(summary)
  const title = error ?? (summary === undefined ? '正在读取锐捷 SSO 账号' : `${label} · 剩余 ${money(summary.billing.remaining)}`)

  return (
    <div ref={seatRef} className="ruijieAccountSeat">
      <button
        type="button"
        className="ruijieAccountTrigger"
        data-wide={wide || undefined}
        data-error={error !== undefined || undefined}
        aria-label={title}
        aria-expanded={open}
        title={title}
        onClick={() => { setOpen(value => !value) }}
      >
        <span className="ruijieAccountMark"><RuijieMark size={21} /></span>
        {wide && (
          <>
            <span className="ruijieAccountIdentity">
              <strong>{label}</strong>
              <small>{summary?.account.email ?? '锐捷 SSO'}</small>
            </span>
            <span className="ruijieAccountBalance">
              <small>剩余额度</small>
              <strong>{loading && summary === undefined ? '读取中' : error ?? compactMoney(summary?.billing.remaining ?? 0)}</strong>
            </span>
          </>
        )}
      </button>
      {open && (
        <section className="ruijieAccountPopover" data-wide={wide || undefined} aria-label="锐捷账号与额度">
          <header>
            <span><RuijieMark size={25} /></span>
            <div><strong>{label}</strong><small>{summary?.account.email ?? '已通过锐捷 SSO 登录'}</small></div>
          </header>
          {summary === undefined ? (
            <p className="ruijieAccountMessage">{error ?? '正在读取个人额度…'}</p>
          ) : (
            <dl>
              <div><dt>总额度</dt><dd>{money(summary.billing.total)}</dd></div>
              <div><dt>已使用</dt><dd>{money(summary.billing.used)}</dd></div>
              <div className="ruijieAccountRemaining"><dt>剩余额度</dt><dd>{money(summary.billing.remaining)}</dd></div>
            </dl>
          )}
          <footer>
            <span>额度归属当前 SSO 账号</span>
            <span className="ruijieAccountActions">
              <button type="button" disabled={loggingOut} onClick={() => { void logout() }}>{loggingOut ? '正在退出…' : '退出登录'}</button>
              <button type="button" disabled={loading || loggingOut} onClick={() => { void refresh() }}>刷新</button>
            </span>
          </footer>
        </section>
      )}
    </div>
  )
}

const ACCOUNT_STYLES = `
*:has(> .ruijieAccountSeat) { flex-direction: column; gap: 4px; }
.ruijieAccountSeat { position: relative; box-sizing: border-box; flex: none; width: 100%; min-width: 0; padding: 0 2px 4px; }
.ruijieAccountTrigger { box-sizing: border-box; width: 36px; height: 36px; padding: 0; border: 1px solid transparent; border-radius: 11px; color: var(--dsw-alias-label-primary); background: transparent; display: flex; align-items: center; cursor: pointer; font: inherit; text-align: left; }
.ruijieAccountTrigger:hover { background: var(--dsw-alias-interactive-bg-hover); }
.ruijieAccountTrigger:focus-visible { outline: 2px solid #4d6bfe; outline-offset: 2px; }
.ruijieAccountTrigger[data-wide] { width: 100%; height: 52px; gap: 9px; padding: 7px 9px; border-color: var(--dsw-alias-border-l2); background: color-mix(in srgb, #4d6bfe 5%, var(--dsw-specific-sidebar-fill)); }
.ruijieAccountTrigger[data-wide]:hover { border-color: color-mix(in srgb, #4d6bfe 35%, var(--dsw-alias-border-l2)); background: color-mix(in srgb, #4d6bfe 9%, var(--dsw-specific-sidebar-fill)); }
.ruijieAccountMark { width: 32px; height: 32px; border-radius: 9px; flex: none; display: grid; place-items: center; color: #fff; background: #4d6bfe; }
.ruijieMarkInitials { display: block; color: #fff; font-family: "Segoe UI", Arial, sans-serif; font-weight: 800; font-style: italic; letter-spacing: -1px; line-height: 1; transform: translateX(-1px); }
.ruijieAccountIdentity { min-width: 0; flex: 1; display: flex; flex-direction: column; line-height: 1.25; }
.ruijieAccountIdentity strong, .ruijieAccountIdentity small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ruijieAccountIdentity strong { font-size: 13px; font-weight: 600; }
.ruijieAccountIdentity small { margin-top: 3px; color: var(--dsw-alias-label-tertiary); font-size: 10px; }
.ruijieAccountBalance { flex: none; display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2; }
.ruijieAccountBalance small { color: var(--dsw-alias-label-tertiary); font-size: 10px; }
.ruijieAccountBalance strong { margin-top: 4px; max-width: 92px; color: #4d6bfe; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ruijieAccountTrigger[data-error] .ruijieAccountBalance strong { color: #c43c3c; }
.ruijieAccountPopover { position: fixed; z-index: 1200; left: 68px; bottom: 72px; box-sizing: border-box; width: 286px; padding: 16px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 16px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); box-shadow: 0 18px 50px rgba(15, 24, 48, .18); }
.ruijieAccountPopover[data-wide] { left: 14px; }
.ruijieAccountPopover header { display: flex; align-items: center; gap: 11px; padding-bottom: 13px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.ruijieAccountPopover header > span { width: 38px; height: 38px; border-radius: 11px; color: #fff; background: #4d6bfe; display: grid; place-items: center; }
.ruijieAccountPopover header div { min-width: 0; display: flex; flex-direction: column; }
.ruijieAccountPopover header strong, .ruijieAccountPopover header small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ruijieAccountPopover header strong { font-size: 14px; }
.ruijieAccountPopover header small { margin-top: 4px; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.ruijieAccountPopover dl { margin: 13px 0 0; display: grid; gap: 8px; }
.ruijieAccountPopover dl div { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
.ruijieAccountPopover dt { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.ruijieAccountPopover dd { margin: 0; font-size: 13px; font-variant-numeric: tabular-nums; }
.ruijieAccountPopover .ruijieAccountRemaining { margin-top: 3px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l2); }
.ruijieAccountPopover .ruijieAccountRemaining dd { color: #4d6bfe; font-size: 16px; font-weight: 700; }
.ruijieAccountMessage { margin: 14px 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.ruijieAccountPopover footer { margin-top: 13px; display: flex; justify-content: space-between; align-items: center; color: var(--dsw-alias-label-tertiary); font-size: 10px; }
.ruijieAccountActions { display: flex; align-items: center; gap: 2px; }
.ruijieAccountPopover footer button { border: 0; padding: 4px 7px; border-radius: 7px; color: #4d6bfe; background: transparent; cursor: pointer; font: inherit; }
.ruijieAccountPopover footer button:hover { background: color-mix(in srgb, #4d6bfe 10%, transparent); }
.ruijieAccountPopover footer button:disabled { opacity: .5; cursor: default; }
@media (prefers-reduced-motion: reduce) { .ruijieAccountTrigger { transition: none; } }
`

function installAccountStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-plugin-desktop'
  style.dataset.pluginCss = 'dsh-plugin-desktop/ruijie-account'
  style.textContent = ACCOUNT_STYLES
  document.head.appendChild(style)
  return () => { style.remove() }
}

/** Register the account card into the official sidebar without replacing upstream UI. */
export function applyRuijieAccountCard(ctx: ClientContext): void {
  ctx.effect(() => installAccountStyles(), 'dsh-plugin-desktop: Ruijie account styles')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'ruijie-sso-account',
    order: -100,
    label: '锐捷 SSO 账号与额度',
    registrant: 'dsh-plugin-desktop',
  }, RuijieAccountCard))
}
