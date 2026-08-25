import { SEARCH_RECOVERY_PROMPT } from '../search-recovery-policy.ts'

export { SEARCH_RECOVERY_PROMPT }

export interface IntermediateFailureCandidate {
  insideChatFlow: boolean
  kind: string
  state: string
}

/**
 * Keep operational failures out of the main conversation while preserving
 * Harness's dedicated turn-error node for a task that ultimately fails.
 */
export function shouldHideIntermediateFailure(candidate: IntermediateFailureCandidate): boolean {
  return candidate.insideChatFlow
    && candidate.kind === 'tool-call'
    && (candidate.state === 'error' || candidate.state === 'stopped')
}

const STYLE_ID = 'dsh-desktop-intermediate-failure-style'
const FAILURE_ATTRIBUTE = 'data-dsh-intermediate-failure'

function installStyles(documentRoot: Document): () => void {
  const existing = documentRoot.getElementById(STYLE_ID)
  if (existing !== null) return () => {}
  const style = documentRoot.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    [data-chat-flow]
    [data-chat-flow-kind="tool-call"][${FAILURE_ATTRIBUTE}="hidden"] {
      display: none !important;
    }
  `
  documentRoot.head.append(style)
  return () => { style.remove() }
}

/**
 * Hide failed or stopped Tool rows only in the Chat view. The Trace view does
 * not live under data-chat-flow and retains the complete diagnostic record.
 * A terminal turn failure is a separate turn-error node, so it stays visible.
 */
export function reconcileSearchFailureRows(documentRoot: Document): void {
  const flowRows = documentRoot.querySelectorAll<HTMLElement>(
    '[data-chat-flow] [data-chat-flow-kind="tool-call"]',
  )
  const rowsToHide = new Set<HTMLElement>()
  for (const flowRow of flowRows) {
    const failedState = flowRow.querySelector<HTMLElement>(
      '[data-tool][data-state="error"], [data-tool][data-state="stopped"], '
      + '[data-subcalls] [data-state="error"], [data-subcalls] [data-state="stopped"]',
    )?.dataset.state ?? ''
    if (shouldHideIntermediateFailure({
      insideChatFlow: true,
      kind: flowRow.dataset.chatFlowKind ?? '',
      state: failedState,
    })) rowsToHide.add(flowRow)
  }

  const previouslyHidden = documentRoot.querySelectorAll<HTMLElement>(
    `[data-chat-flow] [${FAILURE_ATTRIBUTE}]`,
  )
  for (const row of previouslyHidden) {
    if (rowsToHide.has(row)) continue
    row.removeAttribute(FAILURE_ATTRIBUTE)
    row.removeAttribute('aria-hidden')
  }
  for (const row of rowsToHide) {
    if (row.getAttribute(FAILURE_ATTRIBUTE) !== 'hidden') {
      row.setAttribute(FAILURE_ATTRIBUTE, 'hidden')
    }
    if (row.getAttribute('aria-hidden') !== 'true') {
      row.setAttribute('aria-hidden', 'true')
    }
  }
}

/** Install quiet intermediate-failure presentation without changing stored events. */
export function installSearchRecoveryPresentation(documentRoot: Document = document): () => void {
  const removeStyles = installStyles(documentRoot)
  let queued = false
  const reconcile = (): void => {
    if (queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      reconcileSearchFailureRows(documentRoot)
    })
  }
  const observer = new MutationObserver(reconcile)
  observer.observe(documentRoot.body, { childList: true, subtree: true, attributes: true })
  reconcile()
  return () => {
    observer.disconnect()
    removeStyles()
  }
}
