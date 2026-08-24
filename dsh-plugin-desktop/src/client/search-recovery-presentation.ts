import { SEARCH_RECOVERY_PROMPT } from '../search-recovery-policy.ts'

export { SEARCH_RECOVERY_PROMPT }

export interface SearchFlowRecord {
  kind: string
  toolName?: string
  state?: string
}

export type SearchFailurePresentation =
  | 'summary-recovering'
  | 'summary-recovered'
  | 'hidden-duplicate'

/**
 * Classify failed tool rows without hiding the underlying diagnostic data.
 * One user request owns at most one visible recoverable summary; any later
 * successful tool step proves that the agent recovered and kept progressing.
 */
export function classifySearchFailureRows(
  records: readonly SearchFlowRecord[],
): SearchFailurePresentation[] {
  const result: SearchFailurePresentation[] = []
  let groupStart = 0
  while (groupStart < records.length) {
    let groupEnd = groupStart + 1
    while (groupEnd < records.length && records[groupEnd]?.kind !== 'user') groupEnd += 1
    const group = records.slice(groupStart, groupEnd)
    const failureIndexes: number[] = []
    let recovered = false
    for (const [index, record] of group.entries()) {
      if (record.kind !== 'tool-call' || record.toolName === undefined) continue
      if (record.state === 'error') failureIndexes.push(index)
      if (record.state === 'ok' && failureIndexes.length > 0) recovered = true
    }
    for (const [index] of failureIndexes.entries()) {
      result.push(index === 0
        ? (recovered ? 'summary-recovered' : 'summary-recovering')
        : 'hidden-duplicate')
    }
    groupStart = groupEnd
  }
  return result
}

const STYLE_ID = 'dsh-desktop-search-recovery-style'

function installStyles(documentRoot: Document): () => void {
  const existing = documentRoot.getElementById(STYLE_ID)
  if (existing !== null) return () => {}
  const style = documentRoot.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    [data-dsh-search-recovery="recovering"],
    [data-dsh-search-recovery="recovered"] {
      --dsw-alias-state-error-primary: var(--dsw-alias-state-warn-primary);
    }
    [data-dsh-search-recovery="recovering"]::before,
    [data-dsh-search-recovery="recovered"]::before {
      display: block;
      margin: 2px 0 2px 22px;
      color: var(--dsw-alias-state-warn-primary);
      font-size: 12px;
      line-height: 18px;
    }
    [data-dsh-search-recovery="recovering"]::before {
      content: "当前步骤未成功，智能体正在切换备用方式";
    }
    [data-dsh-search-recovery="recovered"]::before {
      content: "一个步骤未成功，已自动切换备用方式继续完成任务";
    }
    [data-dsh-search-recovery="duplicate"] {
      display: none !important;
    }
  `
  documentRoot.head.append(style)
  return () => { style.remove() }
}

/** Reconcile upstream tool rows into one subdued recovery summary per prompt. */
export function reconcileSearchFailureRows(documentRoot: Document): void {
  const flowRows = [...documentRoot.querySelectorAll<HTMLElement>('[data-chat-flow-kind]')]
  const records: SearchFlowRecord[] = []
  const failures: HTMLElement[] = []
  for (const flowRow of flowRows) {
    const kind = flowRow.dataset.chatFlowKind ?? ''
    const tool = flowRow.querySelector<HTMLElement>('[data-tool]')
    if (kind === 'tool-call' && tool !== null) {
      const toolName = tool.dataset.tool ?? ''
      const state = tool.dataset.state ?? ''
      records.push({ kind: 'tool-call', toolName, state })
      if (state === 'error') failures.push(tool)
    } else {
      records.push({ kind })
    }
  }
  const presentations = classifySearchFailureRows(records)
  const desired = new Map<HTMLElement, string>()
  for (const [index, tool] of failures.entries()) {
    const presentation = presentations[index]
    if (presentation === undefined) continue
    desired.set(tool, presentation === 'hidden-duplicate'
      ? 'duplicate'
      : presentation === 'summary-recovered' ? 'recovered' : 'recovering')
  }
  for (const tool of documentRoot.querySelectorAll<HTMLElement>('[data-dsh-search-recovery]')) {
    if (desired.has(tool)) continue
    delete tool.dataset.dshSearchRecovery
    tool.removeAttribute('aria-label')
  }
  for (const [tool, presentation] of desired) {
    if (tool.dataset.dshSearchRecovery !== presentation) {
      tool.dataset.dshSearchRecovery = presentation
    }
    const label = presentation === 'recovered'
      ? '一个步骤未成功，已自动切换备用方式继续完成任务；展开可查看技术详情'
      : '当前步骤未成功，智能体正在切换备用方式；展开可查看技术详情'
    if (tool.getAttribute('aria-label') !== label) tool.setAttribute('aria-label', label)
  }
}

/** Install the presentation reconciler without replacing upstream result cards. */
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
