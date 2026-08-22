export interface InstalledWorkbenchSnapshot {
  readonly url: string
  readonly bodyText: string
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
