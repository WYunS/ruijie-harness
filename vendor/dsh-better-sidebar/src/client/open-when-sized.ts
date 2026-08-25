/**
 * Deferred one-shot open for hosts that may not have a real size yet.
 *
 * xterm's `Terminal.open()` must not run in a zero-size container: the
 * renderer creation fails there (the DomRenderer is built from the host's
 * dimensions), leaving the render service's renderer `undefined`, and the
 * next Viewport refresh crashes reading `.dimensions` off it. WebKit-based
 * hosts (WKWebView) reliably report zero while the bottom panel's expand
 * slide is in flight; any `display:none`-hidden ancestor does the same.
 *
 * The caller's `open` callback (open + fit + resize) is invoked exactly
 * once, on the first frame where the host reports a real size. While the
 * host stays zero-sized or is temporarily detached the polling continues
 * every frame. A conversation switch can detach and then reattach the
 * sidebar portal without unmounting this React view; treating that brief
 * `isConnected === false` state as final leaves a connected WebSocket over
 * a permanently blank, unfocusable terminal. The caller cancels polling in
 * its effect cleanup, so a real unmount still stops immediately.
 *
 * `raf`/`caf` are injectable so tests can drive the polling deterministically.
 */
export function openWhenSized(
  host: HTMLElement,
  open: () => void,
  raf: (cb: FrameRequestCallback) => number = requestAnimationFrame,
  caf: (id: number) => void = cancelAnimationFrame,
): () => void {
  let frame: number | null = null
  const step = (): void => {
    frame = null
    if (host.isConnected && host.clientWidth > 0 && host.clientHeight > 0) {
      open()
      return
    }
    frame = raf(step)
  }
  frame = raf(step)
  return () => {
    if (frame !== null) {
      caf(frame)
      frame = null
    }
  }
}
