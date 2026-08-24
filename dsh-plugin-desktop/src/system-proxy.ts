/** Convert Electron's proxy resolution result into a URL understood by Node agents. */
export function proxyUrlFromElectronResult(result: string): string | undefined {
  for (const entry of result.split(';')) {
    const [kind, authority] = entry.trim().split(/\s+/, 2)
    if ((kind === 'PROXY' || kind === 'HTTPS') && authority !== undefined) {
      return `http://${authority}`
    }
    if (kind === 'SOCKS' || kind === 'SOCKS5') {
      if (authority !== undefined) return `socks5://${authority}`
    }
  }
  return undefined
}

/** Preserve explicit operator settings; otherwise share the desktop system proxy with Node integrations. */
export function applyResolvedSystemProxy(environment: NodeJS.ProcessEnv, result: string): void {
  if (environment.HTTPS_PROXY ?? environment.https_proxy ?? environment.HTTP_PROXY ?? environment.http_proxy) return
  const proxy = proxyUrlFromElectronResult(result)
  if (proxy !== undefined && proxy.startsWith('http://')) environment.HTTPS_PROXY = proxy
}
