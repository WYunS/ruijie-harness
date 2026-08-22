/** Refresh cadence while the Files panel is visible. */
export const TREE_AUTO_REFRESH_MS = 2_000

/**
 * Keep shell-created and externally-created files visible without requiring
 * the user to press Refresh. The caller owns visibility by mounting/unmounting
 * this subscription with the Files panel.
 */
export function subscribeTreeRefresh(
  refresh: () => void,
  intervalMs = TREE_AUTO_REFRESH_MS,
): () => void {
  const timer = window.setInterval(refresh, intervalMs)
  const onFocus = (): void => { refresh() }
  window.addEventListener('focus', onFocus)
  return () => {
    window.clearInterval(timer)
    window.removeEventListener('focus', onFocus)
  }
}
