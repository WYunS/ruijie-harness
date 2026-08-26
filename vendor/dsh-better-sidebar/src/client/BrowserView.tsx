/**
 * The built-in browser tab: an address bar plus a sandboxed iframe.
 *
 * Security model (see browser.ts + the sandbox tokens below): the iframe is
 * ALWAYS sandboxed without `allow-same-origin` (opaque origin — the visited
 * page can never sit on the GUI's origin, read its storage, or reach
 * /sidebar/api) and without `allow-top-navigation` (a page must not hijack
 * the GUI). The address bar only accepts http(s) and refuses loopback /
 * the GUI's own origin. The side card setting "关闭浏览器沙箱" drops the
 * sandbox attribute entirely for fully trusted sites — the visited page then
 * runs with the GUI's own origin and full session access, so a persistent
 * warning bar renders while it is off.
 *
 * The URL is persisted onto the tab (path/title via the patchTab reducer)
 * so a reload restores the visited page; the back/forward stack only tracks
 * address-bar navigations (in-frame link clicks are cross-origin and
 * invisible — a documented limitation).
 */
import { useEffect, useRef, useState, type DetailedHTMLProps, type HTMLAttributes } from 'react'
import {
  IconChevronLeftOutline14,
  IconChevronRightOutline14,
  IconLinkOutline14,
  IconRefreshOutline14,
  IconRightUpOutline16,
  IconWarningOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { api } from './api.ts'
import { embeddabilityOf, fallbackSearchUrlForBlockedSite, normalizeBrowserUrl } from './browser.ts'
import { patchTab } from './state.ts'
import { SandboxStatusBar } from './SandboxStatusBar.tsx'
import { t } from './locales.ts'
import type { TabComponentProps } from './service.ts'
import css from './sidebar.module.css'

type NativeWebviewElement = HTMLElement & {
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  getURL(): string
  getWebContentsId(): number
  executeJavaScript<T>(code: string, userGesture?: boolean): Promise<T>
}

type DesktopSidebarPopupBridge = {
  onNavigate(listener: (guestId: number, url: string) => void): () => void
}

type DesktopSidebarPopupWindow = Window & {
  __DSH_DESKTOP_SIDEBAR_POPUP__?: DesktopSidebarPopupBridge
  __DSH_DESKTOP_BROWSER_CONTENT__?: (value: unknown) => void
}

interface ExtractedBrowserPage {
  url: string
  title: string
  text: string
  links: Array<{ url: string; title?: string }>
  truncated: boolean
}

const EXTRACT_BROWSER_PAGE_SCRIPT = `(() => {
  const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const roots = [document.querySelector('article'), document.querySelector('main'), document.querySelector('[role="main"]'), document.body].filter(Boolean);
  let best = '';
  for (const root of roots) {
    const clone = root.cloneNode(true);
    for (const noisy of clone.querySelectorAll('script,style,noscript,svg,nav,footer,aside,form,[aria-hidden="true"]')) noisy.remove();
    const text = clean(clone.innerText || clone.textContent || '');
    if (text.length > best.length) best = text;
  }
  const limit = 50000;
  const links = [];
  const seen = new Set();
  for (const anchor of document.querySelectorAll('a[href]')) {
    let href;
    try { href = new URL(anchor.href, location.href).href; } catch { continue; }
    if (!/^https?:/i.test(href) || seen.has(href)) continue;
    const title = clean(anchor.innerText || anchor.getAttribute('aria-label') || anchor.title);
    if (!title) continue;
    seen.add(href);
    links.push({ url: href, title: title.slice(0, 300) });
    if (links.length >= 30) break;
  }
  return { url: location.href, title: clean(document.title), text: best.slice(0, limit), links, truncated: best.length > limit };
})()`

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        partition?: string
        webpreferences?: string
        allowpopups?: string
      }
    }
  }
}

/**
 * The browser iframe sandbox tokens. NO allow-same-origin (opaque origin —
 * no GUI storage/API access), NO allow-top-navigation (a browsed page must
 * not hijack the GUI). allow-forms/allow-popups/allow-downloads/allow-modals
 * keep login flows working; allow-popups-to-escape-sandbox lets OAuth
 * popups open as normal tabs (they are cross-origin to the GUI either way).
 */
export const BROWSER_IFRAME_SANDBOX =
  'allow-scripts allow-forms allow-popups allow-downloads allow-modals allow-popups-to-escape-sandbox'

export function BrowserView(props: TabComponentProps) {
  const { store, tab } = props
  const nativeWebview = navigator.userAgent.includes('Electron')
  const webviewRef = useRef<NativeWebviewElement | null>(null)
  const fallbackAttemptsRef = useRef(new Set<string>())
  // The current address (initialized from the persisted tab.path so a
  // reload restores the visited page).
  const [url, setUrl] = useState<string | undefined>(tab.path)
  const [input, setInput] = useState<string>(tab.path ?? '')
  /** Blocked/invalid hint shown under the address bar (null = none). */
  const [message, setMessage] = useState<string | null>(null)
  /** Address-bar navigation history (in-frame clicks are not tracked). */
  const [history, setHistory] = useState<string[]>(tab.path !== undefined ? [tab.path] : [])
  const [cursor, setCursor] = useState<number>(tab.path !== undefined ? 0 : -1)
  /** Bumped on reload to remount the iframe (also remounts on sandbox flip). */
  const [reloadKey, setReloadKey] = useState(0)
  /** TEMPORARY sandbox unlock for THIS surface only (never writes the global
   *  side card setting; lasts until the tab unmounts or the user restores). */
  const [localUnlock, setLocalUnlock] = useState(false)
  const noSandbox = store.getPrefs().browserNoSandbox === true || localUnlock
  /** A site that refuses to be embedded (X-Frame-Options / frame-ancestors):
   *  the probe verdict shown instead of the blank iframe. */
  const [embedBlocked, setEmbedBlocked] = useState<string | null>(null)
  /** The user asked to load the refused site anyway (keeps the plain iframe). */
  const [forceEmbed, setForceEmbed] = useState(false)
  const [nativeHistory, setNativeHistory] = useState({ back: false, forward: false })
  const browserNavigationId = tab.meta !== null
    && typeof tab.meta === 'object'
    && !Array.isArray(tab.meta)
    && typeof (tab.meta as Record<string, unknown>).browserNavigationId === 'number'
    ? (tab.meta as Record<string, number>).browserNavigationId
    : undefined
  const browserReadRequestId = tab.meta !== null
    && typeof tab.meta === 'object'
    && !Array.isArray(tab.meta)
    && typeof (tab.meta as Record<string, unknown>).browserReadRequestId === 'number'
    ? (tab.meta as Record<string, number>).browserReadRequestId
    : undefined
  const handledNavigationId = useRef(browserNavigationId)
  const reportedReadId = useRef<number | undefined>(undefined)

  // A model browser command can navigate an already-mounted browser tab by
  // patching its persisted path. Mirror that external change into this
  // view; guest-originated navigations already set both values to the same
  // URL, so the inequality prevents a did-navigate/persist feedback loop.
  useEffect(() => {
    if (tab.path === undefined) return
    const repeatedRequest = browserNavigationId !== undefined
      && browserNavigationId !== handledNavigationId.current
    handledNavigationId.current = browserNavigationId
    if (tab.path === url) {
      if (repeatedRequest) {
        setMessage(null)
        if (nativeWebview && webviewRef.current !== null) webviewRef.current.reload()
        else setReloadKey(key => key + 1)
      }
      return
    }
    const next = tab.path
    setUrl(next)
    setInput(next)
    setMessage(null)
    if (!nativeWebview) {
      setHistory(previous => [...previous.slice(0, cursor + 1), next])
      setCursor(previous => previous + 1)
      setReloadKey(key => key + 1)
    }
  }, [browserNavigationId, cursor, nativeWebview, tab.path, url])

  // Probe every navigation (address bar, history, restored path): when the
  // target forbids embedding, show the reason + open-in-browser instead of
  // the browser's cryptic "refused to connect" blank frame. A failed probe
  // (unreachable) keeps the plain iframe.
  useEffect(() => {
    if (nativeWebview) return
    if (url === undefined) return
    let cancelled = false
    setEmbedBlocked(null)
    setForceEmbed(false)
    void api.browserProbe(url).then((probe) => {
      if (!cancelled && embeddabilityOf(probe) === 'blocked') setEmbedBlocked(url)
    }).catch(() => { /* unreachable: keep the plain iframe */ })
    return () => { cancelled = true }
  }, [nativeWebview, url])

  // Electron's isolated guest page is a real browser surface, so it is not
  // subject to X-Frame-Options/frame-ancestors. It also navigates directly:
  // no slow HEAD probe before every page. Keep the address bar, tab title,
  // history buttons and visible failures synchronized with guest events.
  useEffect(() => {
    if (!nativeWebview || url === undefined) return
    const view = webviewRef.current
    if (view === null) return
    const syncHistory = (): void => {
      setNativeHistory({ back: view.canGoBack(), forward: view.canGoForward() })
    }
    const syncUrl = (): void => {
      const next = view.getURL()
      if (next === '') return
      setUrl(next)
      setInput(next)
      setMessage(null)
      persist(next)
      syncHistory()
    }
    const reportPage = (): void => {
      const commandId = browserReadRequestId !== undefined && reportedReadId.current !== browserReadRequestId
        ? browserReadRequestId
        : 0
      if (commandId > 0) reportedReadId.current = commandId
      void view.executeJavaScript<ExtractedBrowserPage>(EXTRACT_BROWSER_PAGE_SCRIPT).then((page) => {
        if (page === null || typeof page !== 'object') return
        ;(window as DesktopSidebarPopupWindow).__DSH_DESKTOP_BROWSER_CONTENT__?.({
          commandId,
          sessionId: props.scope.sessionId,
          ...page,
        })
      }).catch(() => { /* Host timeout is the silent fallback for unreadable pages. */ })
    }
    const failed = (event: Event): void => {
      const detail = event as Event & { errorCode?: number; errorDescription?: string; validatedURL?: string; isMainFrame?: boolean }
      if (detail.errorCode === -3) return
      if (detail.isMainFrame === false) return
      const target = detail.validatedURL ?? url
      const fallback = fallbackSearchUrlForBlockedSite(target)
      if (fallback !== undefined && !fallbackAttemptsRef.current.has(target)) {
        fallbackAttemptsRef.current.add(target)
        navigateTo(fallback)
        setMessage('当前网络无法访问百度，已自动改用必应搜索同一主题。')
        return
      }
      setMessage(`无法打开 ${target}：${detail.errorDescription ?? '网络或网站暂时不可用'}`)
      syncHistory()
    }
    const popupBridge = (window as DesktopSidebarPopupWindow).__DSH_DESKTOP_SIDEBAR_POPUP__
    const unsubscribePopup = popupBridge?.onNavigate((guestId, nextUrl) => {
      if (view.getWebContentsId() === guestId) navigateTo(nextUrl)
    })
    view.addEventListener('did-navigate', syncUrl)
    view.addEventListener('did-navigate-in-page', syncUrl)
    const stopped = (): void => { syncHistory(); reportPage() }
    view.addEventListener('did-stop-loading', stopped)
    view.addEventListener('did-fail-load', failed)
    return () => {
      unsubscribePopup?.()
      view.removeEventListener('did-navigate', syncUrl)
      view.removeEventListener('did-navigate-in-page', syncUrl)
      view.removeEventListener('did-stop-loading', stopped)
      view.removeEventListener('did-fail-load', failed)
    }
  // navigateTo/persist are intentionally resolved from the current render;
  // the effect rebinds when the requested URL changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserReadRequestId, nativeWebview, props.scope.sessionId, url])

  const persist = (nextUrl: string): void => {
    let host = nextUrl
    try { host = new URL(nextUrl).hostname } catch { /* keep the URL as title */ }
    store.reduce(state => patchTab(state, tab.id, { path: nextUrl, title: host }))
  }

  const navigateTo = (raw: string): void => {
    const result = normalizeBrowserUrl(raw, window.location.origin)
    if (result.kind === 'ok') {
      const next = result.url
      if (next === url) {
        setInput(next)
        setMessage(null)
        if (nativeWebview && webviewRef.current !== null) webviewRef.current.reload()
        else setReloadKey(key => key + 1)
        persist(next)
        return
      }
      setUrl(next)
      setInput(next)
      setMessage(null)
      // Push onto the stack, dropping any stale forward entries.
      setHistory(previous => [...previous.slice(0, cursor + 1), next])
      setCursor(previous => previous + 1)
      setReloadKey(key => key + 1)
      persist(next)
      return
    }
    setMessage(result.kind === 'invalid'
      ? t('browserInvalid')
      : result.reason === 'scheme' ? t('browserBlockedScheme')
      : t('browserBlockedLoopback'))
  }

  const goBack = (): void => {
    if (nativeWebview && webviewRef.current?.canGoBack()) {
      webviewRef.current.goBack()
      return
    }
    if (cursor <= 0) return
    const next = history[cursor - 1]!
    setCursor(cursor - 1)
    setUrl(next)
    setInput(next)
    setReloadKey(key => key + 1)
  }

  const goForward = (): void => {
    if (nativeWebview && webviewRef.current?.canGoForward()) {
      webviewRef.current.goForward()
      return
    }
    if (cursor >= history.length - 1) return
    const next = history[cursor + 1]!
    setCursor(cursor + 1)
    setUrl(next)
    setInput(next)
    setReloadKey(key => key + 1)
  }

  return (
    <div className={css.browser}>
      <div className={css.browserBar}>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('browserBack')}
          title={t('browserBack')}
          disabled={nativeWebview ? !nativeHistory.back : cursor <= 0}
          onClick={goBack}
        >
          <IconChevronLeftOutline14 />
        </button>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('browserForward')}
          title={t('browserForward')}
          disabled={nativeWebview ? !nativeHistory.forward : cursor >= history.length - 1}
          onClick={goForward}
        >
          <IconChevronRightOutline14 />
        </button>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('refresh')}
          title={t('refresh')}
          onClick={() => {
            if (nativeWebview && webviewRef.current !== null) webviewRef.current.reload()
            else setReloadKey(key => key + 1)
          }}
        >
          <IconRefreshOutline14 />
        </button>
        <input
          className={css.browserInput}
          value={input}
          placeholder={t('browserPlaceholder')}
          spellCheck={false}
          onChange={event => { setInput(event.target.value) }}
          onKeyDown={event => {
            if (event.key === 'Enter') navigateTo(input)
          }}
        />
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('browserGo')}
          title={t('browserGo')}
          onClick={() => { navigateTo(input) }}
        >
          <IconLinkOutline14 />
        </button>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('browserOpenExternal')}
          title={t('browserOpenExternal')}
          disabled={url === undefined}
          onClick={() => {
            if (url !== undefined) window.open(url, '_blank', 'noopener')
          }}
        >
          <IconRightUpOutline16 size={15} />
        </button>
      </div>
      {message !== null && <div className={css.browserMessage}>{message}</div>}
      {!nativeWebview && <SandboxStatusBar
          sandboxed={!noSandbox}
          local={localUnlock}
          dangerCopy={t('browserNoSandboxWarning')}
          onUnlock={() => { setLocalUnlock(true) }}
          onRestore={() => { setLocalUnlock(false) }}
        />}
      {url === undefined ? (
        <div className={css.browserStart}>{t('browserStart')}</div>
      ) : nativeWebview ? (
        <webview
          ref={node => { webviewRef.current = node as NativeWebviewElement | null }}
          className={css.browserFrame}
          src={url}
          webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes"
          allowpopups="true"
        />
      ) : embedBlocked !== null && !forceEmbed ? (
        <BrowserEmbedBlocked
          url={embedBlocked}
          onOpenInBrowser={() => { window.open(embedBlocked, '_blank', 'noopener') }}
          onLoadAnyway={() => { setForceEmbed(true) }}
        />
      ) : (
        <iframe
          key={`${reloadKey}:${noSandbox ? 'ns' : 'sb'}`}
          className={css.browserFrame}
          src={url}
          sandbox={noSandbox ? undefined : BROWSER_IFRAME_SANDBOX}
          referrerPolicy="no-referrer"
          allow=""
          title={url}
        />
      )}
    </div>
  )
}

/**
 * The embed-refusal panel: shown when the probed site forbids being
 * displayed inside other pages (X-Frame-Options / frame-ancestors) — the
 * iframe would only show the browser's "refused to connect" blank. Explains
 * the reason and offers the real-browser open plus a load-anyway escape.
 * Exported so the copy and the actions are testable without a DOM.
 */
export function BrowserEmbedBlocked(props: {
  url: string
  onOpenInBrowser: () => void
  onLoadAnyway: () => void
}) {
  const { url, onOpenInBrowser, onLoadAnyway } = props
  let host = url
  try { host = new URL(url).hostname } catch { /* keep the raw URL */ }
  return (
    <div className={css.browserBlocked}>
      <IconWarningOutline16 size={16} />
      <div className={css.browserBlockedTitle}>{t('browserEmbedBlocked', { host })}</div>
      <div className={css.browserBlockedDesc}>{t('browserEmbedBlockedDesc')}</div>
      <div className={css.browserBlockedActions}>
        <button type="button" className={css.browserBlockedButton} onClick={onOpenInBrowser}>
          {t('browserOpenExternal')}
        </button>
        <button type="button" className={css.browserBlockedButton} onClick={onLoadAnyway}>
          {t('browserEmbedAnyway')}
        </button>
      </div>
    </div>
  )
}
